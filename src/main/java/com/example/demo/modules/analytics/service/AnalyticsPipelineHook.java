package com.example.demo.modules.analytics.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 门禁拉取/清洗总库流水线完成后刷新统计订阅快照（日/周/月审计日志）。
 */
@Component
public class AnalyticsPipelineHook {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsPipelineHook.class);

    private final AnalyticsAuditService auditService;

    public AnalyticsPipelineHook(AnalyticsAuditService auditService) {
        this.auditService = auditService;
    }

    /** 在昨日日批拉取 Job / {@code ACCESS_CLEAN_PACKAGE_DAILY} 成功后调用。 */
    public void afterAccessDataPipeline() {
        try {
            auditService.runAuditForAllSubscribed(AnalyticsReportRegistry.REPORT_ISOLATION_USAGE);
            auditService.runAuditForAllSubscribed(AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY);
            log.info("[analytics-pipeline] 已刷新隔离服/笼架订阅统计快照");
        } catch (Exception e) {
            log.warn("[analytics-pipeline] 订阅统计刷新失败: {}", e.getMessage());
        }
    }
}
