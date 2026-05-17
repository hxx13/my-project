package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.entity.AnalyticsAuditLog;
import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.mapper.AnalyticsAuditLogMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 为统计页 AI 对话封箱清算数据。
 * viewId=0 表示报表下全部配置；viewId&gt;0 表示单条配置（兼容旧会话）。
 */
@Service
public class AnalyticsChatContextService {

    /** 与分享码 source_view_id=0 一致：报表级（全部配置） */
    public static final long REPORT_SCOPE_VIEW_ID = 0L;

    private static final int MAX_VIEWS = 32;
    private static final int MAX_PERIODS_PER_VIEW = 36;
    private static final int TOP_GROUPS = 12;
    private static final int TOP_REGIONS = 10;

    private final AnalyticsUserViewMapper viewMapper;
    private final AnalyticsAuditLogMapper auditLogMapper;
    private final AnalyticsAuditService auditService;
    private final ObjectMapper objectMapper;

    public AnalyticsChatContextService(
            AnalyticsUserViewMapper viewMapper,
            AnalyticsAuditLogMapper auditLogMapper,
            AnalyticsAuditService auditService,
            ObjectMapper objectMapper) {
        this.viewMapper = viewMapper;
        this.auditLogMapper = auditLogMapper;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    public boolean isReportScope(long viewId) {
        return viewId == REPORT_SCOPE_VIEW_ID;
    }

    public String buildContextJson(String userId, long viewId, String reportKey) {
        if (isReportScope(viewId)) {
            return buildAllViewsContextJson(userId, reportKey);
        }
        AnalyticsUserView view = viewMapper.selectByIdAndUser(viewId, userId);
        if (view == null) {
            throw new IllegalArgumentException("配置不存在");
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("reportKey", reportKey);
        root.put("scope", "single_view");
        root.put("viewCount", 1);
        root.put("views", List.of(buildViewPayload(userId, reportKey, view)));
        root.put(
                "note",
                "数据为单条统计配置下已清算各期快照；byProjectGroup 为课题组，byRegion 含地区与房间；可跨期比较。");
        return writeJson(root);
    }

    private String buildAllViewsContextJson(String userId, String reportKey) {
        List<AnalyticsUserView> views = viewMapper.selectByUserAndReport(userId, reportKey);
        if (views.isEmpty()) {
            throw new IllegalArgumentException("暂无统计配置，请先保存至少一条配置");
        }
        List<Map<String, Object>> viewPayloads = new ArrayList<>();
        for (AnalyticsUserView view : views) {
            if (viewPayloads.size() >= MAX_VIEWS) {
                break;
            }
            viewPayloads.add(buildViewPayload(userId, reportKey, view));
        }
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("reportKey", reportKey);
        root.put("scope", "all_views");
        root.put("viewCount", views.size());
        root.put("viewsIncluded", viewPayloads.size());
        root.put("views", viewPayloads);
        root.put(
                "note",
                "数据为本报表下全部（或前 "
                        + MAX_VIEWS
                        + " 条）统计配置各自的清算快照；跨配置比较时请引用 viewName 与 periodLabel；"
                        + "byProjectGroup 为课题组，byRegion 含地区与房间。");
        return writeJson(root);
    }

    private Map<String, Object> buildViewPayload(String userId, String reportKey, AnalyticsUserView view) {
        List<AnalyticsAuditLog> raw =
                auditLogMapper.selectByUserAndReport(userId, reportKey, view.getId(), 200);
        Map<String, AnalyticsAuditLog> deduped = new LinkedHashMap<>();
        for (AnalyticsAuditLog log : raw) {
            String key = log.getPeriodType() + "|" + log.getPeriodLabel();
            AnalyticsAuditLog prev = deduped.get(key);
            if (prev == null || log.getCreatedAt().isAfter(prev.getCreatedAt())) {
                deduped.put(key, log);
            }
        }
        List<AnalyticsAuditLog> periods = new ArrayList<>(deduped.values());
        periods.sort(Comparator.comparing(AnalyticsAuditLog::getPeriodLabel).reversed());
        if (periods.size() > MAX_PERIODS_PER_VIEW) {
            periods = periods.subList(0, MAX_PERIODS_PER_VIEW);
        }

        List<Map<String, Object>> periodPayloads = new ArrayList<>();
        for (AnalyticsAuditLog row : periods) {
            try {
                Map<String, Object> detail = auditService.getDetailForUser(userId, row.getId());
                periodPayloads.add(compactPeriod(detail));
            } catch (Exception ignored) {
                periodPayloads.add(compactFromListRow(row));
            }
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("viewId", view.getId());
        m.put("viewName", view.getName());
        m.put("filterJson", view.getFilterJson());
        m.put("periodCount", periodPayloads.size());
        m.put("periods", periodPayloads);
        return m;
    }

    private String writeJson(Map<String, Object> root) {
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("封箱统计数据失败: " + e.getMessage());
        }
    }

    private Map<String, Object> compactPeriod(Map<String, Object> detail) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("periodType", detail.get("periodType"));
        m.put("periodLabel", detail.get("periodLabel"));
        m.put("currentRounds", detail.get("currentRounds"));
        m.put("previousRounds", detail.get("previousRounds"));
        m.put("deltaRounds", detail.get("deltaRounds"));
        m.put("deltaPct", detail.get("deltaPct"));
        m.put("summary", detail.get("summary"));
        m.put("byProjectGroup", topN(detail.get("byProjectGroup"), TOP_GROUPS));
        m.put("byRegion", topN(detail.get("byRegion"), TOP_REGIONS));
        return m;
    }

    private Map<String, Object> compactFromListRow(AnalyticsAuditLog row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("periodType", row.getPeriodType());
        m.put("periodLabel", row.getPeriodLabel());
        m.put("currentRounds", row.getCurrentRounds());
        m.put("previousRounds", row.getPreviousRounds());
        m.put("deltaRounds", row.getDeltaRounds());
        m.put("deltaPct", row.getDeltaPct());
        return m;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> topN(Object raw, int limit) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                out.add((Map<String, Object>) map);
            }
            if (out.size() >= limit) {
                break;
            }
        }
        return out;
    }
}
