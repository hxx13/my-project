package com.example.demo.modules.analytics.scheduler;

import com.example.demo.modules.analytics.service.AnalyticsAuditService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 每日为全部已订阅筛选配置生成日/周/月对比审计日志。
 */
@Component
public class AnalyticsAuditScheduler {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsAuditScheduler.class);
    private static final String REPORT_ISOLATION = "isolation_usage";

    private final AnalyticsAuditService auditService;

    public AnalyticsAuditScheduler(AnalyticsAuditService auditService) {
        this.auditService = auditService;
    }

    @Scheduled(cron = "${app.analytics.audit-cron:0 10 1 * * ?}")
    public void dailyAuditForSubscribedViews() {
        try {
            auditService.runAuditForAllSubscribed(REPORT_ISOLATION);
            log.info("[analytics-audit] 订阅视图周期审计已完成");
        } catch (Exception e) {
            log.error("[analytics-audit] 定时审计失败: {}", e.getMessage());
        }
    }
}
