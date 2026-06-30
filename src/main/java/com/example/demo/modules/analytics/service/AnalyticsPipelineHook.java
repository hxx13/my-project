package com.example.demo.modules.analytics.service;

import com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 门禁拉取/清洗总库流水线完成后刷新统计订阅快照（日/周/月审计日志）。
 * 包含安全网：审计前对昨日执行全量清洗，防止逐任务自动清洗遗漏。
 */
@Component
public class AnalyticsPipelineHook {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsPipelineHook.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AnalyticsAuditService auditService;
    private final AccessSwingCleanWorkspaceService workspaceService;

    public AnalyticsPipelineHook(
            AnalyticsAuditService auditService,
            AccessSwingCleanWorkspaceService workspaceService) {
        this.auditService = auditService;
        this.workspaceService = workspaceService;
    }

    /** 在昨日日批拉取 Job / {@code ACCESS_CLEAN_PACKAGE_DAILY} 成功后调用。 */
    public void afterAccessDataPipeline() {
        try {
            // 安全网：审计前对昨日执行一次全量清洗，确保逐任务自动清洗未遗漏的数据也能被覆盖
            LocalDate yesterday = LocalDate.now().minusDays(1);
            String startTime = yesterday.atStartOfDay().format(DT_FMT);
            String endTime = yesterday.atTime(23, 59, 59).format(DT_FMT);
            try {
                var result = workspaceService.forceMergeAllChannelsForWindow(
                        startTime, endTime, "PIPELINE_SAFETY_NET");
                log.warn("[analytics-pipeline] safety net clean done: ok={} fail={} included={}",
                        result.get("ok"), result.get("fail"), result.get("totalIncluded"));
            } catch (Exception e) {
                log.warn("[analytics-pipeline] safety net clean failed (non-fatal): {}", e.getMessage());
            }

            auditService.runAuditForAllSubscribed(AnalyticsReportRegistry.REPORT_ISOLATION_USAGE);
            auditService.runAuditForAllSubscribed(AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY);
            log.warn("[analytics-pipeline] 已刷新隔离服/笼架订阅统计快照");
        } catch (Exception e) {
            log.warn("[analytics-pipeline] 订阅统计刷新失败: {}", e.getMessage());
        }
    }
}
