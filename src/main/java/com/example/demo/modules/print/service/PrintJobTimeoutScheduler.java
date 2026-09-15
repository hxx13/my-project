package com.example.demo.modules.print.service;

import com.example.demo.modules.print.mapper.PrintJobMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 把超时未回执的 SENT 任务标成 FAILED。
 *
 * 走 idx_print_job_status_sent，只捞 status='SENT' AND sent_at < 阈值，不全表扫。
 * 阈值与扫描间隔都是配置项。
 */
@Component
public class PrintJobTimeoutScheduler {

    private static final Logger log = LoggerFactory.getLogger(PrintJobTimeoutScheduler.class);

    private final PrintJobMapper mapper;
    private final int timeoutMinutes;

    public PrintJobTimeoutScheduler(
            PrintJobMapper mapper,
            @Value("${app.print.timeout-minutes:5}") int timeoutMinutes) {
        this.mapper = mapper;
        this.timeoutMinutes = Math.max(1, timeoutMinutes);
    }

    @Scheduled(fixedDelayString = "${app.print.timeout-scan-ms:60000}")
    public void scan() {
        try {
            int n = mapper.failTimedOut(timeoutMinutes);
            if (n > 0) {
                log.warn("[print] {} 条打印任务超时未回执，已标为 FAILED（阈值 {} 分钟）", n, timeoutMinutes);
            }
        } catch (Exception e) {
            log.warn("[print] 打印任务超时扫描失败: {}", e.getMessage());
        }
    }
}
