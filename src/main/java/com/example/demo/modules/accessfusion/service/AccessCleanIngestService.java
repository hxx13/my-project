package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile;
import com.example.demo.modules.accessfusion.support.AccessCleanDaySplitSupport;
import com.example.demo.modules.accessfusion.support.AccessCleanDaySplitSupport.DayWindow;
import com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService.CleanMergeResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 清洗入库编排：按自然日 × 通道分批合并，逐日写执行日志（可 upsert 防重复）。
 */
@Service
public class AccessCleanIngestService {

    private static final Logger log = LoggerFactory.getLogger(AccessCleanIngestService.class);

    private final AccessSwingCleanWorkspaceService workspaceService;
    private final AccessCleanRuleProfileService ruleProfileService;
    private final AccessCleanExecutionLogService executionLogService;

    public AccessCleanIngestService(
            AccessSwingCleanWorkspaceService workspaceService,
            AccessCleanRuleProfileService ruleProfileService,
            AccessCleanExecutionLogService executionLogService) {
        this.workspaceService = workspaceService;
        this.ruleProfileService = ruleProfileService;
        this.executionLogService = executionLogService;
    }

    public Map<String, Object> ingestWindow(
            long statsTaskId,
            List<String> channelCodes,
            String windowStart,
            String windowEnd,
            Long cleanRuleProfileId,
            String triggerType) {
        if (channelCodes == null || channelCodes.isEmpty()) {
            throw new IllegalArgumentException("未配置清洗通道");
        }
        if (!StringUtils.hasText(windowStart) || !StringUtils.hasText(windowEnd)) {
            throw new IllegalArgumentException("清洗时间窗不能为空");
        }
        AccessCleanRuleProfile profile = resolveProfile(statsTaskId, cleanRuleProfileId);
        boolean requireMapping = ruleProfileService.requireMapping(profile);
        boolean openSuccessOnly = ruleProfileService.openSuccessOnly(profile);
        String direction = ruleProfileService.directionFilter(profile, null);
        Long profileId = profile.getId();

        List<DayWindow> days = AccessCleanDaySplitSupport.split(windowStart, windowEnd);
        if (days.isEmpty()) {
            throw new IllegalArgumentException("无法解析清洗时间窗");
        }

        List<Map<String, Object>> ledger = new ArrayList<>();
        int includedTotal = 0;
        int scannedTotal = 0;
        int truncatedSegments = 0;

        for (DayWindow day : days) {
            for (String channelCode : channelCodes) {
                if (!StringUtils.hasText(channelCode)) {
                    continue;
                }
                String ch = channelCode.trim();
                try {
                    CleanMergeResult merged =
                            workspaceService.mergePackage(
                                    statsTaskId,
                                    AccessSwingCleanWorkspaceService.SCOPE_SELECTED_TASK,
                                    ch,
                                    day.windowStart(),
                                    day.windowEnd(),
                                    true,
                                    requireMapping,
                                    openSuccessOnly,
                                    false,
                                    direction,
                                    List.of());
                    var logRow =
                            executionLogService.upsertDayChannelMerge(
                                    statsTaskId,
                                    profileId,
                                    ch,
                                    day.coverageDay(),
                                    day.windowStart(),
                                    day.windowEnd(),
                                    profile,
                                    merged,
                                    triggerType);

                    int scanned = merged.run() != null ? intVal(merged.run().getTotalScanned()) : 0;
                    int included = merged.run() != null ? intVal(merged.run().getIncludedCount()) : 0;
                    boolean truncated = isTruncated(merged);
                    if (truncated) {
                        truncatedSegments++;
                    }
                    scannedTotal += scanned;
                    includedTotal += included;

                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("coverageDay", day.coverageDay());
                    entry.put("channelCode", ch);
                    entry.put("windowStart", day.windowStart());
                    entry.put("windowEnd", day.windowEnd());
                    entry.put("totalScanned", scanned);
                    entry.put("includedCount", included);
                    entry.put("excludedCount", merged.run() != null ? merged.run().getExcludedCount() : 0);
                    entry.put("truncated", truncated);
                    entry.put("executionLogId", logRow.getId());
                    entry.put("status", truncated ? "PARTIAL" : "SUCCESS");
                    ledger.add(entry);
                } catch (Exception e) {
                    log.warn(
                            "clean ingest failed task={} day={} channel={}: {}",
                            statsTaskId,
                            day.coverageDay(),
                            ch,
                            e.getMessage());
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("coverageDay", day.coverageDay());
                    entry.put("channelCode", ch);
                    entry.put("status", "FAILED");
                    entry.put("error", e.getMessage());
                    ledger.add(entry);
                }
            }
        }

        Map<String, Object> batchSummary =
                executionLogService.recordBatchSummary(
                        statsTaskId,
                        profileId,
                        windowStart,
                        windowEnd,
                        channelCodes,
                        profile,
                        ledger,
                        triggerType);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dayCount", days.size());
        out.put("channelCount", channelCodes.size());
        out.put("ledgerEntryCount", ledger.size());
        out.put("includedTotal", includedTotal);
        out.put("scannedTotal", scannedTotal);
        out.put("truncatedSegments", truncatedSegments);
        out.put("dailyLedger", ledger);
        out.put("batchSummaryLog", batchSummary);
        return out;
    }

    private AccessCleanRuleProfile resolveProfile(long statsTaskId, Long cleanRuleProfileId) {
        if (cleanRuleProfileId != null && cleanRuleProfileId > 0) {
            return ruleProfileService.get(cleanRuleProfileId);
        }
        if (statsTaskId > 0) {
            return ruleProfileService.resolveForStatsTask(statsTaskId);
        }
        List<AccessCleanRuleProfile> all = ruleProfileService.listAll();
        if (all.isEmpty()) {
            throw new IllegalArgumentException("无清洗规则方案");
        }
        return all.get(0);
    }

    @SuppressWarnings("unchecked")
    private static boolean isTruncated(CleanMergeResult merged) {
        if (merged == null || merged.run() == null) {
            return false;
        }
        String json = merged.run().getConfigSnapshotJson();
        if (!StringUtils.hasText(json)) {
            return false;
        }
        try {
            return json.contains("\"truncated\":true");
        } catch (Exception e) {
            return false;
        }
    }

    private static int intVal(Integer v) {
        return v == null ? 0 : v;
    }
}
