package com.example.demo.modules.print.service;

import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.mapper.PrintJobMapper;
import com.example.demo.modules.print.mapper.PrintStationMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 后端直发（SERVER）工位的打印机端口探测。
 *
 * KIOSK 工位看工位页心跳（{@link PrintStationHealthService#touch}），
 * SERVER 工位没有常开电脑，只能后端自己探打印机还活着没有。
 *
 * 为什么不查 lpstat：CUPS 对 socket:// 后端不做持续探测，打印机断电了照样报 idle，
 * 直到真派一单才发现。TCP 连 9100 才是「此刻能不能收活」的真实答案。
 *
 * 探测结果写 printer_online + printer_checked_at。checked_at 无论通不通都写 ——
 * 健康判定靠它的新鲜度区分「探测任务挂了」和「打印机不通」，漏写会让两台都判成 OFFLINE。
 *
 * 同一轮里还顺带核对 CUPS 队列（{@link PrintQueueControlService#listQueuedJobIds}）：
 * TCP 通只证明打印机这台机器活着，证明不了队列在工作 —— 队列被停用时 lp 照样返回 0、
 * 此前的探测照样报「可达」，70 条任务就那么卡在 CUPS 里没人知道。核对结果写 print_job.queue_state。
 */
@Component
public class PrinterReachabilityProbe {

    private static final Logger log = LoggerFactory.getLogger(PrinterReachabilityProbe.class);

    /** 打印机原始打印端口（RAW / 9100）。 */
    private static final int PORT = 9100;

    /** 连接超时。一台不可达的机器不能把这一轮卡住。 */
    private static final int CONNECT_TIMEOUT_MS = 3000;

    /**
     * 每个工位最近一次核对失败的原因，用来给重复失败去噪。
     *
     * <p>本地（Windows、没有 lpstat）这条失败是**常态**而非偶发，每 60 秒刷一条 WARN
     * 就是纯噪音，能把日志淹掉。但失败原因一旦变了（从"没装 lpstat"变成"超时"）还得
     * 立刻看见，所以是**按原因去重**、不是按次数丢弃。
     */
    private final Map<String, String> lastReconcileError = new ConcurrentHashMap<>();

    private final PrintStationMapper printStationMapper;
    private final JdbcTemplate jdbc;
    private final PrintQueueControlService queueControl;
    private final PrintJobMapper jobMapper;

    /** 队列核对只看最近这么多小时内提交、且拿到过作业号的任务（见 application.properties）。 */
    private final int queueReconcileHours;

    public PrinterReachabilityProbe(PrintStationMapper printStationMapper, JdbcTemplate jdbc,
                                    PrintQueueControlService queueControl, PrintJobMapper jobMapper,
                                    @Value("${app.print.queue-reconcile-hours:24}") int queueReconcileHours) {
        this.printStationMapper = printStationMapper;
        this.jdbc = jdbc;
        this.queueControl = queueControl;
        this.jobMapper = jobMapper;
        // 钳到至少 1 小时：配 0 会把核对范围收成空，等于永远不核对，静默失效。
        this.queueReconcileHours = Math.max(1, queueReconcileHours);
    }

    @Scheduled(fixedDelayString = "${app.print.probe-ms:60000}")
    public void probe() {
        try {
            List<PrintStation> stations = printStationMapper.listEnabled();
            int probed = 0;
            int online = 0;
            for (PrintStation s : stations) {
                if (!PrintStation.MODE_SERVER.equals(s.getMode())) {
                    continue;
                }
                try {
                    boolean reachable = probeHost(s.getPrinterIp());
                    jdbc.update("UPDATE print_station SET printer_online = ?, printer_checked_at = NOW() WHERE id = ?",
                            reachable ? 1 : 0, s.getId());
                    probed++;
                    if (reachable) {
                        online++;
                    }
                } catch (Exception e) {
                    // 逐台兜住：单台的写库或解析异常不能拖垮后面几台
                    log.warn("[print] 工位 {} 打印机探测写回失败: {}", s.getId(), e.getMessage());
                }
                // 队列核对与 TCP 探测同属这台工位的一轮巡检，但各自兜底：
                // reconcileQueue 内部消化所有异常、永不抛出，所以它既拖不垮上面的探测写回，
                // 也拖不垮后面几台。
                reconcileQueue(s);
            }
            if (probed > 0) {
                // DEBUG：每 60 秒一轮都打，INFO 会把日志淹掉。探测还活着的证据在
                // print_station.printer_checked_at（工位列表的「连接」列就靠它），不需要日志再报一遍。
                log.debug("[print] 打印机探测完成：SERVER 工位 {} 台，可达 {} 台", probed, online);
            }
        } catch (Exception e) {
            // 整轮兜底：后台任务抛出去没人接
            log.warn("[print] 打印机探测失败: {}", e.getMessage());
        }
    }

    /**
     * 顺带核对这台工位对应的 CUPS 队列里还排着哪些作业，把库里 queue_state 收敛一次
     * （{@link PrintJobMapper#markQueueState}）。
     *
     * <p><b>失败必须整台跳过、一行都不写。</b> queue_state 的 NULL 语义是「我们不知道」；
     * listQueuedJobIds 失败（命令没配 / 打印机没配 IP / lpstat 超时 / 本地没这命令）意味着
     * 「问不到」，绝不能当成「队列是空的」。一旦把问不到当空队列去调 markQueueState，
     * 卡在队列里的任务会被刷成 CLEARED（已不在队列）—— 界面重新开始撒谎，
     * 而且撒的正是这次刚修好的那个谎。所以只有成功拿到集合才往下走调 markQueueState；
     * 两个 catch 都直接 return，写库那行永远走不到。
     *
     * <p>本地是 Windows、没有 lpstat，这条失败路径是**常态**而非罕见分支。
     */
    private void reconcileQueue(PrintStation s) {
        Set<String> queued;
        try {
            queued = queueControl.listQueuedJobIds(s.getPrinterIp());
        } catch (InterruptedException e) {
            // 本线程被要求停下，恢复中断标志交回上层；一样不写库。
            Thread.currentThread().interrupt();
            log.warn("[print] 工位 {} 队列核对被中断，queue_state 保持原值", s.getId());
            return;
        } catch (Exception e) {
            warnOnce(s.getId(), e.getMessage());
            return;
        }
        try {
            jobMapper.markQueueState(s.getId(), queued, queueReconcileHours);
            // 核对成功就清掉上次的失败记录：万一之后再坏，才会重新报一次。
            lastReconcileError.remove(s.getId());
            // 成功每条不刷 INFO（每 60 秒一台一条），留 DEBUG 可查。
            log.debug("[print] 工位 {} 队列核对完成，队列中 {} 条", s.getId(), queued.size());
        } catch (Exception e) {
            // 已经拿到队列快照，这里失败只是写回没落库，下一轮还会再核对一次。
            warnOnce(s.getId(), "写回失败: " + e.getMessage());
        }
    }

    /**
     * 同一条失败原因只报一次 WARN；原因没变就降到 DEBUG。
     *
     * <p>核对失败会把 queue_state 原样保留，而这个"没核对过"的状态在工位列表和派发下拉里
     * 本来就看得见 —— 所以不打日志不等于没人知道，只是不再每分钟重复同一句。
     */
    private void warnOnce(String stationId, String message) {
        String msg = message == null ? "" : message;
        String prev = lastReconcileError.put(stationId, msg);
        if (msg.equals(prev)) {
            log.debug("[print] 工位 {} 队列核对仍失败（原因未变）: {}", stationId, msg);
            return;
        }
        log.warn("[print] 工位 {} 队列核对失败，queue_state 保持原值: {}", stationId, msg);
    }

    /** 连得上 9100 = 在线。null / 空 / 格式不对一律判不通，不抛。 */
    private boolean probeHost(String host) {
        if (host == null || host.trim().isEmpty()) {
            return false;
        }
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host.trim(), PORT), CONNECT_TIMEOUT_MS);
            return true;
        } catch (IOException e) {
            // ConnectException / SocketTimeoutException / UnknownHostException 都是它的子类，
            // 一个 IOException 就全覆盖；多 catch 里同时写父类和子类编译不过。
            return false;
        }
    }
}
