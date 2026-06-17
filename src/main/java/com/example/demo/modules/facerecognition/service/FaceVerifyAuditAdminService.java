package com.example.demo.modules.facerecognition.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.example.demo.modules.facerecognition.entity.FaceVerifyAuditRecord;
import com.example.demo.modules.facerecognition.mapper.FaceVerifyAuditMapper;
import com.example.demo.modules.twin.common.entity.TwinAutomationLog;
import com.example.demo.modules.twin.common.support.TwinAutomationLogDisplayHelper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 将 face_verify_audit 映射为自动化日志页统一行结构。
 */
@Service
public class FaceVerifyAuditAdminService {

    public static final String TYPE_FACE_VERIFY = "FACE_VERIFY";
    public static final String TRIGGER_USER = "USER";
    /** 单条验证会话最多保留抓拍 URL 数 */
    public static final int MAX_PROBE_IMAGES_PER_SESSION = 6;

    private final FaceVerifyAuditMapper auditMapper;

    public FaceVerifyAuditAdminService(FaceVerifyAuditMapper auditMapper) {
        this.auditMapper = auditMapper;
    }

    public Map<String, Object> listPage(
            String triggerType,
            String keyword,
            LocalDateTime startTime,
            LocalDateTime endTime,
            int page,
            int pageSize,
            Map<String, Map<String, String>> displayOverrides,
            Map<String, String> jobNames
    ) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(200, Math.max(10, pageSize));
        int offset = (safePage - 1) * safeSize;
        long total = auditMapper.countAdminPage(blankToNull(triggerType), blankToNull(keyword), startTime, endTime);
        List<FaceVerifyAuditRecord> raw = auditMapper.selectAdminPage(
                blankToNull(triggerType), blankToNull(keyword), startTime, endTime, offset, safeSize);
        List<TwinAutomationLog> list = new ArrayList<>();
        for (FaceVerifyAuditRecord r : raw) {
            TwinAutomationLog row = toAutomationLogRow(r);
            TwinAutomationLogDisplayHelper.applyLabels(row, jobNames, displayOverrides);
            list.add(row);
        }
        Map<String, Object> out = new HashMap<>();
        out.put("list", list);
        out.put("total", total);
        out.put("page", safePage);
        out.put("pageSize", safeSize);
        return out;
    }

    /**
     * 与 twin_automation_log 合并分页（「全部类型」筛选项）。
     */
    public List<TwinAutomationLog> fetchHeadForMerge(
            String triggerType,
            String keyword,
            LocalDateTime startTime,
            LocalDateTime endTime,
            int limit
    ) {
        if (limit <= 0) {
            return List.of();
        }
        List<FaceVerifyAuditRecord> raw = auditMapper.selectAdminPage(
                blankToNull(triggerType), blankToNull(keyword), startTime, endTime, 0, limit);
        List<TwinAutomationLog> list = new ArrayList<>();
        for (FaceVerifyAuditRecord r : raw) {
            list.add(toAutomationLogRow(r));
        }
        return list;
    }

    public long countForMerge(String triggerType, String keyword, LocalDateTime startTime, LocalDateTime endTime) {
        return auditMapper.countAdminPage(blankToNull(triggerType), blankToNull(keyword), startTime, endTime);
    }

    public TwinAutomationLog toAutomationLogRow(FaceVerifyAuditRecord r) {
        TwinAutomationLog row = new TwinAutomationLog();
        row.setLogSource("face");
        row.setId(r.getId());
        row.setAutomationType(TYPE_FACE_VERIFY);
        row.setEventKey(normalizeSource(r.getSource()));
        row.setTriggerType(TRIGGER_USER);
        row.setTriggerReason(resolveTriggerReason(r));
        row.setUserId(r.getUserId());
        row.setUserName(r.getUserName());
        row.setTargetId(r.getSessionId());
        row.setSuccess(Boolean.TRUE.equals(r.getMatched()) ? 1 : 0);
        row.setDetail(buildDetail(r));
        row.setDetailDisplayZh(buildDetailDisplay(r));
        row.setEventTime(r.getCreatedAt());
        row.setCreatedBy("face-verify");
        row.setProbeImageUrls(parseUrlList(r.getProbeImageUrls()));
        row.setBaselineImageUrl(r.getBestBaselineImageUrl());
        row.setFaceSimilarity(r.getSimilarity());
        row.setFaceModelVersion(r.getModelVersion());
        return row;
    }

    private static String normalizeSource(String source) {
        if (source == null || source.isBlank()) {
            return "gate";
        }
        return source.trim().toLowerCase(Locale.ROOT);
    }

    private static String resolveTriggerReason(FaceVerifyAuditRecord r) {
        if (Boolean.FALSE.equals(r.getProbeFaceDetected())) {
            return "FACE_NO_FACE";
        }
        if (Boolean.TRUE.equals(r.getMatched())) {
            return "FACE_MATCH";
        }
        Double sim = r.getSimilarity();
        Double reject = r.getRejectThreshold();
        if (sim != null && reject != null && sim < reject) {
            return "FACE_REJECT";
        }
        return "FACE_GRAY";
    }

    private static String buildDetail(FaceVerifyAuditRecord r) {
        StringBuilder sb = new StringBuilder();
        if (r.getSimilarity() != null) {
            sb.append("similarity=").append(String.format(Locale.ROOT, "%.4f", r.getSimilarity()));
        }
        if (r.getMatchThreshold() != null) {
            if (!sb.isEmpty()) sb.append("; ");
            sb.append("matchThreshold=").append(r.getMatchThreshold());
        }
        if (r.getModelVersion() != null) {
            if (!sb.isEmpty()) sb.append("; ");
            sb.append("model=").append(r.getModelVersion());
        }
        if (r.getBaselineCount() != null) {
            if (!sb.isEmpty()) sb.append("; ");
            sb.append("baselines=").append(r.getBaselineCount());
        }
        if (r.getChallengeAction() != null) {
            if (!sb.isEmpty()) sb.append("; ");
            sb.append("challenge=").append(r.getChallengeAction());
        }
        return sb.toString();
    }

    static String buildDetailDisplay(FaceVerifyAuditRecord r) {
        StringBuilder sb = new StringBuilder();
        if (r.getSimilarity() != null) {
            sb.append(String.format(Locale.ROOT, "相似度 %.1f%%", r.getSimilarity() * 100));
        }
        if (r.getMatchThreshold() != null) {
            sb.append(String.format(Locale.ROOT, "（通过线≥%.0f%%）", r.getMatchThreshold() * 100));
        }
        if (r.getModelVersion() != null) {
            sb.append(" · 模型 ").append(r.getModelVersion());
        }
        if (r.getBaselineCount() != null) {
            sb.append(" · 底库 ").append(r.getBaselineCount()).append(" 张");
        }
        if (r.getChallengeAction() != null && !r.getChallengeAction().isBlank()) {
            sb.append(" · 活体 ").append(r.getChallengeAction());
        }
        if (r.getTopSimsJson() != null && !r.getTopSimsJson().isBlank()) {
            sb.append(" · Top ").append(r.getTopSimsJson());
        }
        int probeCount = parseUrlList(r.getProbeImageUrls()).size();
        if (probeCount > 0) {
            sb.append(" · 抓拍 ").append(probeCount).append(" 张");
        }
        return sb.toString();
    }

    static List<String> parseUrlList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JSONArray arr = JSON.parseArray(json);
            List<String> out = new ArrayList<>();
            for (int i = 0; i < arr.size(); i++) {
                String u = arr.getString(i);
                if (u != null && !u.isBlank()) {
                    out.add(u.trim());
                }
            }
            return out;
        } catch (Exception ignored) {
            return List.of();
        }
    }

    static String toTopSimsJson(List<Double> topSims) {
        if (topSims == null || topSims.isEmpty()) {
            return null;
        }
        return JSON.toJSONString(topSims);
    }

    static String toProbeUrlsJson(List<String> urls) {
        if (urls == null || urls.isEmpty()) {
            return null;
        }
        return JSON.toJSONString(urls);
    }

    /** 合并已有与新抓拍 URL，去重并保留最新若干张 */
    public static List<String> mergeProbeUrls(String existingJson, List<String> newUrls) {
        java.util.LinkedHashSet<String> set = new java.util.LinkedHashSet<>();
        for (String u : parseUrlList(existingJson)) {
            set.add(u);
        }
        if (newUrls != null) {
            for (String u : newUrls) {
                if (u != null && !u.isBlank()) {
                    set.add(u.trim());
                }
            }
        }
        List<String> all = new ArrayList<>(set);
        if (all.size() <= MAX_PROBE_IMAGES_PER_SESSION) {
            return all;
        }
        return all.subList(all.size() - MAX_PROBE_IMAGES_PER_SESSION, all.size());
    }

    public static int countProbeUrls(String existingJson) {
        return parseUrlList(existingJson).size();
    }

    public static void sortMergedByTimeDesc(List<TwinAutomationLog> rows) {
        rows.sort(Comparator
                .comparing(TwinAutomationLog::getEventTime, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(TwinAutomationLog::getId, Comparator.nullsLast(Comparator.reverseOrder())));
    }

    private static String blankToNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s.trim();
    }
}
