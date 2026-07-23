package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanExecutionLog;
import com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile;
import com.example.demo.modules.accessfusion.entity.AccessSwingCleanRun;
import com.example.demo.modules.accessfusion.mapper.AccessCleanExecutionLogMapper;
import com.example.demo.modules.accessfusion.service.AccessSwingCleanWorkspaceService.CleanMergeResult;
import com.example.demo.modules.accessfusion.support.SwingDirectionFilterSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AccessCleanExecutionLogService {

    private final AccessCleanExecutionLogMapper logMapper;
    private final ObjectMapper objectMapper;

    public AccessCleanExecutionLogService(AccessCleanExecutionLogMapper logMapper, ObjectMapper objectMapper) {
        this.logMapper = logMapper;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> list(
            Long statsPullTaskId,
            Long cleanRuleProfileId,
            String executionDate,
            String status,
            int page,
            int pageSize) {
        int offset = Math.max(0, (page - 1) * Math.max(pageSize, 1));
        int limit = Math.min(Math.max(pageSize, 1), 200);
        int total = logMapper.countByFilter(statsPullTaskId, cleanRuleProfileId, executionDate, status);
        List<AccessCleanExecutionLog> items =
                logMapper.selectByFilter(statsPullTaskId, cleanRuleProfileId, executionDate, status, limit, offset);
        List<Map<String, Object>> views = new ArrayList<>();
        for (AccessCleanExecutionLog row : items) {
            views.add(toListView(row));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("items", views);
        out.put("page", page);
        out.put("pageSize", limit);
        return out;
    }

    public Map<String, Object> detail(long id) {
        AccessCleanExecutionLog row = logMapper.selectById(id);
        if (row == null) {
            throw new IllegalArgumentException("执行日志不存在");
        }
        return toDetailView(row);
    }

    /** @deprecated 单段合并；新逻辑请用 {@link #upsertDayChannelMerge} */
    @Transactional
    public AccessCleanExecutionLog recordAfterMerge(
            Long statsPullTaskId,
            Long cleanRuleProfileId,
            String channelCode,
            String windowStart,
            String windowEnd,
            CleanMergeResult merged) {
        return upsertDayChannelMerge(
                statsPullTaskId,
                cleanRuleProfileId,
                channelCode,
                inferCoverageDay(windowStart),
                windowStart,
                windowEnd,
                null,
                merged,
                "LEGACY");
    }

    @Transactional
    public AccessCleanExecutionLog upsertDayChannelMerge(
            Long statsPullTaskId,
            Long cleanRuleProfileId,
            String channelCode,
            String coverageDay,
            String windowStart,
            String windowEnd,
            AccessCleanRuleProfile profile,
            CleanMergeResult merged,
            String triggerType) {
        AccessSwingCleanRun run = merged != null ? merged.run() : null;
        String day = StringUtils.hasText(coverageDay) ? coverageDay.trim() : inferCoverageDay(windowStart);
        String ch = StringUtils.hasText(channelCode) ? channelCode.trim() : "";

        AccessCleanExecutionLog existing = null;
        if (statsPullTaskId != null && statsPullTaskId > 0 && StringUtils.hasText(ch) && StringUtils.hasText(day)) {
            existing = logMapper.selectByTaskChannelDay(statsPullTaskId, ch, day);
        }

        AccessCleanExecutionLog row = existing != null ? existing : new AccessCleanExecutionLog();
        row.setStatsPullTaskId(statsPullTaskId);
        row.setCleanRuleProfileId(cleanRuleProfileId);
        row.setExecutionDate(day);
        row.setCoverageDay(day);
        row.setChannelCode(ch);
        row.setWindowStart(windowStart);
        row.setWindowEnd(windowEnd);
        row.setChannelCodesJson("[\"" + escapeJson(ch) + "\"]");
        if (run != null) {
            row.setTotalScanned(run.getTotalScanned());
            row.setIncludedCount(run.getIncludedCount());
            row.setExcludedCount(run.getExcludedCount());
            row.setReviewCount(run.getReviewCount());
            boolean truncated = run.getTotalScanned() != null && run.getTotalScanned() >= 49_000;
            row.setStatus(truncated ? "PARTIAL" : "SUCCESS");
            row.setConfigSnapshotJson(buildDayConfigSnapshot(profile, run, triggerType, day, ch, windowStart, windowEnd));
        } else {
            row.setStatus("SUCCESS");
        }
        row.setNoteText(buildDayNote(profile, row));

        if (existing != null) {
            logMapper.update(row);
        } else {
            logMapper.insert(row);
        }
        return row;
    }

    @Transactional
    public Map<String, Object> recordBatchSummary(
            Long statsPullTaskId,
            Long cleanRuleProfileId,
            String windowStart,
            String windowEnd,
            List<String> channelCodes,
            AccessCleanRuleProfile profile,
            List<Map<String, Object>> dailyLedger,
            String triggerType) {
        Set<String> expectedDays = new LinkedHashSet<>();
        Set<String> loggedDays = new LinkedHashSet<>();
        int includedSum = 0;
        int failed = 0;
        for (Map<String, Object> e : dailyLedger) {
            if (e.get("coverageDay") != null) {
                loggedDays.add(String.valueOf(e.get("coverageDay")));
            }
            if ("FAILED".equals(e.get("status"))) {
                failed++;
            } else if (e.get("includedCount") instanceof Number n) {
                includedSum += n.intValue();
            }
        }
        for (Map<String, Object> e : dailyLedger) {
            if (e.get("coverageDay") != null) {
                expectedDays.add(String.valueOf(e.get("coverageDay")));
            }
        }

        AccessCleanExecutionLog row = new AccessCleanExecutionLog();
        row.setStatsPullTaskId(statsPullTaskId);
        row.setCleanRuleProfileId(cleanRuleProfileId);
        row.setExecutionDate(inferCoverageDay(windowEnd));
        row.setCoverageDay(null);
        row.setChannelCode(null);
        row.setWindowStart(windowStart);
        row.setWindowEnd(windowEnd);
        try {
            row.setChannelCodesJson(objectMapper.writeValueAsString(channelCodes));
        } catch (Exception e) {
            row.setChannelCodesJson("[]");
        }
        row.setStatus(failed > 0 ? "PARTIAL" : "SUCCESS");
        row.setIncludedCount(includedSum);
        row.setTotalScanned(includedSum);
        row.setExcludedCount(0);
        row.setReviewCount(0);

        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("logType", "BATCH_SUMMARY");
        snap.put("triggerType", triggerType);
        snap.put("ruleProfile", ruleProfileSnapshot(profile));
        snap.put("windowStart", windowStart);
        snap.put("windowEnd", windowEnd);
        snap.put("channelCodes", channelCodes);
        snap.put("dailyLedger", dailyLedger);
        snap.put("ledgerEntryCount", dailyLedger.size());
        snap.put("distinctCoverageDays", loggedDays.size());
        snap.put("failedSegments", failed);
        snap.put("confirmNote", "按自然日×通道逐段入库；同任务+通道+覆盖日重复执行将覆盖原日志防重复");
        try {
            row.setConfigSnapshotJson(objectMapper.writeValueAsString(snap));
        } catch (Exception e) {
            row.setConfigSnapshotJson("{}");
        }
        row.setNoteText(
                String.format(
                        "批次汇总：%d 段 · 纳入合计 %d · 覆盖 %d 个自然日%s",
                        dailyLedger.size(),
                        includedSum,
                        loggedDays.size(),
                        failed > 0 ? " · " + failed + " 段失败" : ""));
        logMapper.insert(row);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.getId());
        out.put("dailyLedger", dailyLedger);
        out.put("distinctCoverageDays", loggedDays.size());
        return out;
    }

    @Transactional
    public void delete(long id) {
        if (logMapper.selectById(id) == null) {
            throw new IllegalArgumentException("执行日志不存在");
        }
        logMapper.deleteById(id);
    }

    @Transactional
    public AccessCleanExecutionLog updateMeta(long id, String noteText, String status) {
        AccessCleanExecutionLog existing = logMapper.selectById(id);
        if (existing == null) {
            throw new IllegalArgumentException("执行日志不存在");
        }
        if (StringUtils.hasText(noteText)) {
            existing.setNoteText(noteText.trim());
        }
        if (StringUtils.hasText(status)) {
            existing.setStatus(status.trim());
        } else if (StringUtils.hasText(noteText)) {
            existing.setStatus("EDITED");
        }
        logMapper.update(existing);
        return logMapper.selectById(id);
    }

    private Map<String, Object> toListView(AccessCleanExecutionLog row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", row.getId());
        m.put("statsPullTaskId", row.getStatsPullTaskId());
        m.put("cleanRuleProfileId", row.getCleanRuleProfileId());
        m.put("executionDate", row.getExecutionDate());
        m.put("coverageDay", row.getCoverageDay());
        m.put("channelCode", row.getChannelCode());
        m.put("windowStart", row.getWindowStart());
        m.put("windowEnd", row.getWindowEnd());
        m.put("status", row.getStatus());
        m.put("totalScanned", row.getTotalScanned());
        m.put("includedCount", row.getIncludedCount());
        m.put("excludedCount", row.getExcludedCount());
        m.put("reviewCount", row.getReviewCount());
        m.put("noteText", row.getNoteText());
        m.put("createdAt", row.getCreatedAt());
        Map<String, Object> snap = parseSnap(row.getConfigSnapshotJson());
        m.put("logType", snap.get("logType"));
        m.put("ruleProfileName", ruleNameFromSnap(snap));
        m.put("ruleSummary", ruleSummaryFromSnap(snap));
        if ("BATCH_SUMMARY".equals(snap.get("logType"))) {
            m.put("dailyLedger", snap.get("dailyLedger"));
            m.put("ledgerEntryCount", snap.get("ledgerEntryCount"));
        }
        return m;
    }

    private Map<String, Object> toDetailView(AccessCleanExecutionLog row) {
        Map<String, Object> m = toListView(row);
        m.put("configSnapshot", parseSnap(row.getConfigSnapshotJson()));
        m.put("channelCodesJson", row.getChannelCodesJson());
        return m;
    }

    private String buildDayNote(AccessCleanRuleProfile profile, AccessCleanExecutionLog row) {
        String rule = profile != null ? profile.getName() : "（方案见快照）";
        return String.format(
                "覆盖日 %s · 通道 %s · 扫描 %d · 纳入 %d · 排除 %d · 方案「%s」",
                row.getCoverageDay(),
                row.getChannelCode(),
                intVal(row.getTotalScanned()),
                intVal(row.getIncludedCount()),
                intVal(row.getExcludedCount()),
                rule);
    }

    private String buildDayConfigSnapshot(
            AccessCleanRuleProfile profile,
            AccessSwingCleanRun run,
            String triggerType,
            String coverageDay,
            String channelCode,
            String windowStart,
            String windowEnd) {
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("logType", "DAY_CHANNEL");
        snap.put("triggerType", triggerType);
        snap.put("coverageDay", coverageDay);
        snap.put("channelCode", channelCode);
        snap.put("windowStart", windowStart);
        snap.put("windowEnd", windowEnd);
        snap.put("ruleProfile", ruleProfileSnapshot(profile));
        if (run != null) {
            snap.put("lastRunId", run.getId());
            snap.put("totalScanned", run.getTotalScanned());
            snap.put("includedCount", run.getIncludedCount());
            snap.put("excludedCount", run.getExcludedCount());
            snap.put("reviewCount", run.getReviewCount());
            Map<String, Object> runSnap = parseSnap(run.getConfigSnapshotJson());
            snap.put("mergeConfig", runSnap);
        }
        try {
            return objectMapper.writeValueAsString(snap);
        } catch (Exception e) {
            return "{}";
        }
    }

    private Map<String, Object> ruleProfileSnapshot(AccessCleanRuleProfile profile) {
        Map<String, Object> r = new LinkedHashMap<>();
        if (profile == null) {
            return r;
        }
        r.put("id", profile.getId());
        r.put("name", profile.getName());
        r.put("debounceSeconds", profile.getDebounceSeconds());
        r.put(
                "swingDirectionFilter",
                SwingDirectionFilterSupport.label(
                        SwingDirectionFilterSupport.normalize(profile.getSwingDirectionFilter())));
        r.put("requireMapping", profile.getRequireMapping() != null && profile.getRequireMapping() != 0);
        r.put("requireMappingLabel", profile.getRequireMapping() != null && profile.getRequireMapping() != 0 ? "仅已映射" : "不限制映射");
        r.put("openSuccessOnly", profile.getOpenSuccessOnly() == null || profile.getOpenSuccessOnly() != 0);
        r.put("autoCleanPackage", profile.getAutoCleanPackage());
        r.put(
                "audienceNote",
                "学生/工作人员仅统计标签（部门ID或映射名含「学生」为学生），清洗不按受众排除");
        return r;
    }

    private String ruleNameFromSnap(Map<String, Object> snap) {
        if (snap.get("ruleProfile") instanceof Map<?, ?> rp) {
            Object n = rp.get("name");
            return n != null ? String.valueOf(n) : "";
        }
        return "";
    }

    private String ruleSummaryFromSnap(Map<String, Object> snap) {
        if (!(snap.get("ruleProfile") instanceof Map<?, ?> rp)) {
            return "";
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> p = (Map<String, Object>) rp;
        List<String> parts = new ArrayList<>();
        if (p.get("debounceSeconds") != null) {
            parts.add("去抖" + p.get("debounceSeconds") + "s");
        }
        if (p.get("swingDirectionFilter") != null) {
            parts.add(String.valueOf(p.get("swingDirectionFilter")));
        }
        if (p.get("requireMappingLabel") != null) {
            parts.add(String.valueOf(p.get("requireMappingLabel")));
        }
        if (Boolean.TRUE.equals(p.get("openSuccessOnly"))) {
            parts.add("仅开门成功");
        }
        return String.join(" · ", parts);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseSnap(String json) {
        if (!StringUtils.hasText(json)) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private static String inferCoverageDay(String windowStart) {
        if (!StringUtils.hasText(windowStart)) {
            return java.time.LocalDate.now().toString();
        }
        String s = windowStart.trim().replace("T", " ");
        return s.length() >= 10 ? s.substring(0, 10) : java.time.LocalDate.now().toString();
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static int intVal(Integer v) {
        return v == null ? 0 : v;
    }
}
