package com.example.demo.modules.print.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Map;
import java.util.Set;

/**
 * 「直发工位」的打印机队列控制：列队列、撤单条、清整台。
 *
 * <p>存在的理由是一次事故：CUPS 队列被停用后 {@code lp} 仍返回退出码 0，系统把任务标成
 * PRINTED、界面显示成功，70 条任务卡在 CUPS 里，而前端无从撤销 —— 之前整条链路
 * <b>完全触及不到真正的打印机队列</b>。投递成功（退出码 0）只代表进了队列，
 * 队列里的实况与撤销得靠 {@code lpstat}/{@code cancel} 单独问。
 *
 * <p>命令模板是配置项而非写死（同 {@code direct-command}）：生产是 Linux/CUPS，
 * 开发机是 Windows，两边没有同一套命令。默认值留空 —— 匹配不到配置就明确报错，
 * 说清是哪个配置项没配，绝不静默当成功。
 *
 * <p>三条命令的失败口径**故意不一致**（见各方法注释）：撤销单条是「达到目标即可」，
 * 失败吞掉；清整台与列队列是「没做到就不能回一句成功」，失败往上抛。
 */
@Service
public class PrintQueueControlService {

    private static final Logger log = LoggerFactory.getLogger(PrintQueueControlService.class);

    private final PrintCommandRunner runner;
    private final String listCommand;
    private final String cancelJobCommand;
    private final String cancelQueueCommand;
    private final long timeoutSeconds;

    public PrintQueueControlService(PrintCommandRunner runner,
                                    @Value("${app.print.queue-list-command:}") String listCommand,
                                    @Value("${app.print.cancel-job-command:}") String cancelJobCommand,
                                    @Value("${app.print.cancel-queue-command:}") String cancelQueueCommand,
                                    @Value("${app.print.queue-command-timeout-seconds:20}") long timeoutSeconds) {
        this.runner = runner;
        this.listCommand = listCommand;
        this.cancelJobCommand = cancelJobCommand;
        this.cancelQueueCommand = cancelQueueCommand;
        this.timeoutSeconds = Math.max(5, timeoutSeconds);
        if (isBlank(listCommand) || isBlank(cancelJobCommand) || isBlank(cancelQueueCommand)) {
            log.warn("[print] 队列控制命令未配齐（list={} job={} queue={}）：对应动作会明确报错",
                    isBlank(listCommand) ? "缺" : "有",
                    isBlank(cancelJobCommand) ? "缺" : "有",
                    isBlank(cancelQueueCommand) ? "缺" : "有");
        }
    }

    /**
     * 列出这台打印机队列里还没打完的作业号。
     *
     * <p>命令没配 / 跑不动 → 抛 IOException，由调用方决定降级。**不在这里吞成空集合** ——
     * 空集合的意思是「队列是空的」，跟「我们问不到」是两回事；把后者当后者处理，
     * 才会再次出现「队列停用但界面显示一切正常」。
     */
    public Set<String> listQueuedJobIds(String target) throws IOException, InterruptedException {
        if (isBlank(target)) {
            throw new IOException("缺少打印机队列名：它就是工位的 printer_ip，空着没法问队列");
        }
        if (isBlank(listCommand)) {
            throw new IOException("未配置 app.print.queue-list-command，问不到这台机器队列里的作业");
        }
        String output = runner.run(listCommand, Map.of("target", target), timeoutSeconds);
        Set<String> ids = PrintCommandRunner.parseQueueJobIds(output);
        // DEBUG：这条会被探测任务每 60 秒打一次，INFO 会把日志淹掉
        log.debug("[print] 队列 {} 现有作业 {} 条", target, ids.size());
        return ids;
    }

    /**
     * 撤掉一条作业。
     *
     * <p>目标状态是「这一条别再打」—— 它已经不在队列（打完了 / 被清了）就等于目标达成。
     * 所以命令失败**一律吞掉**，只 log.warn，不抛。唯一抛的情形是命令根本没配。
     *
     * <p>中断不吞：那是本线程被要求停下，跟「命令没跑成」是两回事，交回给调用方。
     */
    public void cancelJob(String cupsJobId) throws IOException, InterruptedException {
        if (isBlank(cupsJobId)) {
            throw new IOException("缺少 CUPS 作业号，没法撤单");
        }
        if (isBlank(cancelJobCommand)) {
            throw new IOException("未配置 app.print.cancel-job-command，这台机器不具备撤销单条作业的能力");
        }
        try {
            runner.run(cancelJobCommand, Map.of("jobId", cupsJobId), timeoutSeconds);
            log.info("[print] 已撤销作业 {}", cupsJobId);
        } catch (IOException e) {
            log.warn("[print] 撤销作业 {} 未成功（按已达目标处理）: {}", cupsJobId, e.getMessage());
        }
    }

    /**
     * 清空一台打印机的队列。返回 CUPS 侧实际清掉的条数（先列后清，用来给人话回执）。
     *
     * <p>与 {@link #cancelJob} 相反：这条**失败要抛**。清空是用户明确要求「把这台机器上
     * 所有排队的都撤掉」，命令没跑成功却回一句「已清空」，用户会以为队列空了、
     * 实际纸还会照样出来。
     *
     * <p>顺序是先列后清：条数只能从清之前的队列快照拿，清完再数就永远是 0。
     */
    public int clearQueue(String target) throws IOException, InterruptedException {
        if (isBlank(target)) {
            throw new IOException("缺少打印机队列名：它就是工位的 printer_ip，空着没法清队列");
        }
        if (isBlank(cancelQueueCommand)) {
            throw new IOException("未配置 app.print.cancel-queue-command，这台机器不具备清队列能力");
        }
        int before = listQueuedJobIds(target).size();
        runner.run(cancelQueueCommand, Map.of("target", target), timeoutSeconds);
        log.info("[print] 已清空队列 {}，撤掉 {} 条", target, before);
        return before;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
