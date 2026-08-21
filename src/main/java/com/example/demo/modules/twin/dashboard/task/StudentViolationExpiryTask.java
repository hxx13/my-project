package com.example.demo.modules.twin.dashboard.task;

import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 违规记录过期扫描。
 *
 * <p>此前 touchExpireStale() 仅在业务方法中懒触发（扫码、管理端操作、滞留建单等），
 * 系统闲置时已过期记录会长期停留在 ACTIVE。这里补一条独立调度；懒触发保留，作为实时性兜底。
 */
@Component
public class StudentViolationExpiryTask {

    private static final Logger log = LoggerFactory.getLogger(StudentViolationExpiryTask.class);

    private final TwinStudentViolationService violationService;

    public StudentViolationExpiryTask(TwinStudentViolationService violationService) {
        this.violationService = violationService;
    }

    @Scheduled(
            initialDelayString = "${app.student-violation.expiry-initial-delay-ms:60000}",
            fixedDelayString = "${app.student-violation.expiry-scan-ms:300000}")
    public void scanExpired() {
        try {
            violationService.touchExpireStale();
        } catch (Exception e) {
            log.warn("[student-violation] 定时过期扫描失败: {}", e.getMessage());
        }
    }
}
