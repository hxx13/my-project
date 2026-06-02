package com.example.demo.modules.analytics.scheduler;

import com.example.demo.modules.analytics.service.StudentActivitySnapshotService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
public class StudentActivitySnapshotScheduler {

    private static final Logger log = LoggerFactory.getLogger(StudentActivitySnapshotScheduler.class);
    private final StudentActivitySnapshotService snapshotService;

    public StudentActivitySnapshotScheduler(StudentActivitySnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    /** 每日凌晨 2:00 计算昨天的快照 */
    @Scheduled(cron = "0 0 2 * * ?")
    public void dailySnapshot() {
        try {
            LocalDate yesterday = LocalDate.now().minusDays(1);
            snapshotService.computeDate(yesterday);
            log.info("[snapshot-scheduler] 昨日快照完成: {}", yesterday);
        } catch (Exception e) {
            log.error("[snapshot-scheduler] 快照计算失败: {}", e.getMessage());
        }
    }
}
