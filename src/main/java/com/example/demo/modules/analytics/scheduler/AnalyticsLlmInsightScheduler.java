package com.example.demo.modules.analytics.scheduler;

import com.example.demo.modules.analytics.service.AnalyticsLlmInsightService;
import com.example.demo.modules.llm.service.LlmConfigService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 在每日清算审计之后，为尚无 AI 解读的快照批量调用大模型。
 */
@Component
public class AnalyticsLlmInsightScheduler {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsLlmInsightScheduler.class);
    private static final String REPORT_ISOLATION = "isolation_usage";

    private final AnalyticsLlmInsightService llmInsightService;
    private final LlmConfigService llmConfigService;

    public AnalyticsLlmInsightScheduler(AnalyticsLlmInsightService llmInsightService, LlmConfigService llmConfigService) {
        this.llmInsightService = llmInsightService;
        this.llmConfigService = llmConfigService;
    }

    @Scheduled(cron = "${app.analytics.llm-insight-cron:0 30 1 * * ?}")
    public void dailyInsightAfterAudit() {
        if (!llmConfigService.isEnabled() || !llmConfigService.isAutoInsightAfterAudit()) {
            return;
        }
        try {
            int n = llmInsightService.runAutoInsightBatchGlobal(REPORT_ISOLATION, llmConfigService.getAutoInsightBatchLimit());
            log.info("[analytics-llm] 日批自动生成完成，成功 {} 条", n);
        } catch (Exception e) {
            log.error("[analytics-llm] 日批自动生成失败: {}", e.getMessage());
        }
    }
}
