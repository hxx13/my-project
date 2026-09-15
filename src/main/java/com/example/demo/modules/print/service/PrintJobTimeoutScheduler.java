package com.example.demo.modules.print.service;

import com.example.demo.modules.print.mapper.PrintJobMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 把超时未回执的 SENT 任务标成 FAILED，并通知发起人。
 *
 * 走 idx_print_job_status_sent，只捞 status='SENT' AND sent_at < 阈值，不全表扫。
 * 阈值与扫描间隔都是配置项。
 */
@Component
public class PrintJobTimeoutScheduler {

    private static final Logger log = LoggerFactory.getLogger(PrintJobTimeoutScheduler.class);

    private static final String TIMEOUT_REASON = "工位超时未回执";

    private final PrintJobMapper mapper;
    private final PrintJobService jobService;
    private final PrintNotifyService notifyService;
    private final int timeoutMinutes;

    public PrintJobTimeoutScheduler(PrintJobMapper mapper,
                                    PrintJobService jobService,
                                    PrintNotifyService notifyService,
                                    @Value("${app.print.timeout-minutes:5}") int timeoutMinutes) {
        this.mapper = mapper;
        this.jobService = jobService;
        this.notifyService = notifyService;
        this.timeoutMinutes = Math.max(1, timeoutMinutes);
    }

    @Scheduled(fixedDelayString = "${app.print.timeout-scan-ms:60000}")
    public void scan() {
        try {
            List<String> ids = mapper.findTimedOutIds(timeoutMinutes);
            if (ids.isEmpty()) return;

            int n = mapper.failTimedOut(timeoutMinutes);
            log.warn("[print] {} 条打印任务超时未回执，已标为 FAILED（阈值 {} 分钟）", n, timeoutMinutes);

            // 先查后改，只为拿到 id 逐个通知 —— 只回条数的 UPDATE 报不出「哪个任务失败了」。
            // 通知失败不影响状态，异常在 notifyFailed 内部就被吞了。
            for (String id : ids) {
                jobService.findById(id)
                        .ifPresent(j -> notifyService.notifyFailed(j, TIMEOUT_REASON));
            }
        } catch (Exception e) {
            log.warn("[print] 打印任务超时扫描失败: {}", e.getMessage());
        }
    }
}
