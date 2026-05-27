package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.twin.dahua.entity.DahuaSwingStatsPullTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 审计拉取成功后按任务绑定的清洗方案自动入库总库（按自然日×通道分段，逐日写日志）。
 */
@Service
public class AccessStatsPullAutoCleanService {

    private static final Logger log = LoggerFactory.getLogger(AccessStatsPullAutoCleanService.class);

    private final AccessCleanTaskSettingsService taskSettingsService;
    private final AccessCleanRuleProfileService ruleProfileService;
    private final AccessCleanChannelScopeService channelScopeService;
    private final AccessCleanIngestService cleanIngestService;

    public AccessStatsPullAutoCleanService(
            AccessCleanTaskSettingsService taskSettingsService,
            AccessCleanRuleProfileService ruleProfileService,
            AccessCleanChannelScopeService channelScopeService,
            AccessCleanIngestService cleanIngestService) {
        this.taskSettingsService = taskSettingsService;
        this.ruleProfileService = ruleProfileService;
        this.channelScopeService = channelScopeService;
        this.cleanIngestService = cleanIngestService;
    }

    /**
     * @param pulledStart 拉取窗开始（yyyy-MM-dd HH:mm:ss）
     * @param pulledEnd   拉取窗结束
     */
    /**
     * @return 拉取后自动清洗结果摘要；未执行时含 skippedReason
     */
    public Map<String, Object> afterStatsPullSuccess(DahuaSwingStatsPullTask task, String pulledStart, String pulledEnd) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("autoCleanTriggered", false);
        if (task == null || task.getId() == null || task.getId() <= 0) {
            summary.put("autoCleanSkippedReason", "INVALID_TASK");
            return summary;
        }
        long taskId = task.getId();
        if (!StringUtils.hasText(pulledStart) || !StringUtils.hasText(pulledEnd)) {
            summary.put("autoCleanSkippedReason", "EMPTY_PULL_WINDOW");
            return summary;
        }
        if (!taskSettingsService.isAutoCleanPackageEnabled(taskId)) {
            summary.put("autoCleanSkippedReason", "AUTO_CLEAN_DISABLED");
            return summary;
        }
        List<String> channels =
                channelScopeService.resolveEnabledChannelsForClean(taskId, task.getQueryJson());
        if (channels.isEmpty()) {
            log.info(
                    "stats pull task {}: skip auto clean — no channels (scope/query/records empty)",
                    taskId);
            summary.put("autoCleanSkippedReason", "NO_ENABLED_CHANNELS");
            return summary;
        }
        var profile = ruleProfileService.resolveForStatsTask(taskId);
        long profileId = profile.getId() != null ? profile.getId() : 0L;
        try {
            Map<String, Object> batch =
                    cleanIngestService.ingestWindow(
                            taskId,
                            channels,
                            pulledStart,
                            pulledEnd,
                            profileId > 0 ? profileId : null,
                            "AUTO_AFTER_PULL");
            summary.put("autoCleanTriggered", true);
            summary.put("autoCleanChannelCount", channels.size());
            summary.put("cleanIncludedTotal", batch.get("includedTotal"));
            summary.put("cleanScannedTotal", batch.get("scannedTotal"));
            summary.put("cleanChannelCount", batch.get("channelCount"));
            summary.put("cleanDayCount", batch.get("dayCount"));
            log.info(
                    "stats pull task {} auto clean: {} days × {} ch, included {}",
                    taskId,
                    batch.get("dayCount"),
                    batch.get("channelCount"),
                    batch.get("includedTotal"));
        } catch (Exception e) {
            summary.put("autoCleanTriggered", false);
            summary.put("autoCleanError", e.getMessage());
            log.warn("auto clean failed task={}: {}", taskId, e.getMessage());
        }
        return summary;
    }
}
