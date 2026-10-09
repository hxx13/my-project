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
 * <p>失败口径**故意不一致**（见各方法注释）：撤销单条是「达到目标即可」—— 命令报错后
 * 回查队列，确实已经不在就算成功；列队列与清整台是「没做到就不能回一句成功」，
 * 失败一律往上抛。
 *
 * <p>没有「清整台」的独立命令：那在 CUPS 里是 {@code cancel -a} = Purge-Jobs，
 * 只放给 CUPS 管理员；应用以服务账号跑，实测恒定 {@code Forbidden}。清队列改用
 * 下面两条拼起来逐条撤（见 {@link #clearQueue}）。
 */
@Service
public class PrintQueueControlService {

    private static final Logger log = LoggerFactory.getLogger(PrintQueueControlService.class);

    private final PrintCommandRunner runner;
    private final String listCommand;
    private final String cancelJobCommand;
    private final long timeoutSeconds;

    public PrintQueueControlService(PrintCommandRunner runner,
                                    @Value("${app.print.queue-list-command:}") String listCommand,
                                    @Value("${app.print.cancel-job-command:}") String cancelJobCommand,
                                    @Value("${app.print.queue-command-timeout-seconds:20}") long timeoutSeconds) {
        this.runner = runner;
        this.listCommand = listCommand;
        this.cancelJobCommand = cancelJobCommand;
        this.timeoutSeconds = Math.max(5, timeoutSeconds);
        if (isBlank(listCommand) || isBlank(cancelJobCommand)) {
            log.warn("[print] 队列控制命令未配齐（list={} job={}）：对应动作会明确报错",
                    isBlank(listCommand) ? "缺" : "有",
                    isBlank(cancelJobCommand) ? "缺" : "有");
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
     * <p>目标状态是「这一条别再打」—— 它**已经不在队列**（打完了 / 被清了 / 早撤过）就等于
     * 目标达成，命令报错也不抛。但「命令报错」跟「目标达成」不是一回事：`Forbidden`、
     * `cancel` 不在 PATH、超时，走的是同一条 catch。所以报错之后必须去队列里问一句
     * （{@link #listQueuedJobIds}）：**还在队列就是真失败，往上抛**；问不到也一样抛 ——
     * 宁可报一句错，也不能回一句「撤了」而纸照出来，那正是这个类要防的那个谎。
     *
     * <p>中断不吞：那是本线程被要求停下，跟「命令没跑成」是两回事，交回给调用方。
     *
     * @param target 工位的 printer_ip，也就是本机 CUPS 队列名；只用来回查，不参与这条命令
     */
    public void cancelJob(String target, String cupsJobId) throws IOException, InterruptedException {
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
            if (!stillQueued(target, cupsJobId)) {
                log.warn("[print] 撤销作业 {} 命令报错，但它已不在队列（按已达目标处理）: {}",
                        cupsJobId, e.getMessage());
                return;
            }
            throw new IOException("撤销作业 " + cupsJobId + " 未成功，它仍排在队列里：" + e.getMessage(), e);
        }
    }

    /**
     * 这条作业还在不在队列里。
     *
     * <p>**问不到就当「还在」**：猜错的代价不对称 —— 猜「还在」只会少撤一条并如实报错，
     * 猜「不在了」就是上面那个谎（界面说撤了、纸还在出）。
     */
    private boolean stillQueued(String target, String cupsJobId) throws InterruptedException {
        try {
            return listQueuedJobIds(target).contains(cupsJobId);
        } catch (IOException e) {
            log.warn("[print] 撤单报错后回查队列也失败（按仍在队列处理）: {}", e.getMessage());
            return true;
        }
    }

    /**
     * 清空一台打印机的队列。返回 CUPS 侧实际清掉的条数（先列后撤，用来给人话回执）。
     *
     * <p><b>逐条撤，不用 `cancel -a`。</b>清整台在 CUPS 里走 Purge-Jobs，`cupsd.conf`
     * 只放给管理员（`SystemGroup`），应用以服务账号跑、不是管理员，实测恒定
     * `Forbidden`；而 `cancel <作业号>` 是 Cancel-Job，放行作业主本人 —— 队列里的作业
     * 全是本应用提交的，逐条撤正好落在授权范围内。
     *
     * <p>与 {@link #cancelJob} 相反：这条**失败要抛**。又因为单条那步的失败是被吞掉的，
     * 判定只能靠「撤完再列一次」—— 队列没清空绝不回一句成功，否则用户以为队列空了、
     * 实际纸还会照样出来。
     */
    public int clearQueue(String target) throws IOException, InterruptedException {
        if (isBlank(target)) {
            throw new IOException("缺少打印机队列名：它就是工位的 printer_ip，空着没法清队列");
        }
        Set<String> before = listQueuedJobIds(target);
        for (String id : before) {
            cancelJob(target, id);
        }
        Set<String> left = listQueuedJobIds(target);
        if (!left.isEmpty()) {
            throw new IOException("队列里还有 " + left.size() + " 条撤不掉：" + left);
        }
        log.info("[print] 已清空队列 {}，撤掉 {} 条", target, before.size());
        return before.size();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
