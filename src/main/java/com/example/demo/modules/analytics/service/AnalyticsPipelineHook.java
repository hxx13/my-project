package com.example.demo.modules.analytics.service;

import static com.example.demo.common.logging.banner.LoadingSpinner.run;

import com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 门禁拉取/清洗总库流水线完成后刷新统计订阅快照。
 * 安全网：审计前对昨日执行全量清洗，防止逐任务自动清洗遗漏。
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

    public void afterAccessDataPipeline() {
        // 安全网：审计前对昨日执行全量清洗
        LocalDate yesterday = LocalDate.now().minusDays(1);
        String startTime = yesterday.atStartOfDay().format(DT_FMT);
        String endTime = yesterday.atTime(23, 59, 59).format(DT_FMT);
        run("昨日门禁数据安全网清洗", () -> {
            var result = workspaceService.forceMergeAllChannelsForWindow(
                    startTime, endTime, "PIPELINE_SAFETY_NET");
            long fail = result.get("fail") instanceof Number n ? n.longValue() : 0;
            if (fail > 0) {
                log.warn("[analytics-pipeline] safety net: {} channels failed", fail);
            }
        });

        try {
            auditService.runAuditForAllSubscribed(AnalyticsReportRegistry.REPORT_ISOLATION_USAGE);
            auditService.runAuditForAllSubscribed(AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY);
        } catch (Exception e) {
            log.warn("[analytics-pipeline] audit refresh failed: {}", e.getMessage());
        }
    }
}
