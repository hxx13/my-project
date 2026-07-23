package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.entity.AnalyticsAuditLog;
import com.example.demo.modules.analytics.entity.AnalyticsUserView;
import com.example.demo.modules.analytics.mapper.AnalyticsAuditLogMapper;
import com.example.demo.modules.analytics.mapper.AnalyticsUserViewMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 为统计页 AI 对话封箱清算数据。
 * viewId=0 表示报表下全部配置；viewId&gt;0 表示单条配置（兼容旧会话）。
 */
@Service
public class AnalyticsChatContextService {

    /** 与分享码 source_view_id=0 一致：报表级（全部配置） */
    public static final long REPORT_SCOPE_VIEW_ID = 0L;

    private static final int MAX_VIEWS = 32;
    /** 与清算回填 selectAllByView 上限一致，避免 AI 封箱少于页面可见快照 */
    private static final int CHAT_AUDIT_FETCH_LIMIT = 2000;
    /** 含完整 byProjectGroup 等的期次数上限；超出时仍保留全部 periodCatalog 摘要 */
    private static final int MAX_FULL_DETAIL_PERIODS = 200;
    private static final WeekFields ISO_WEEK = WeekFields.ISO;
    private static final int TOP_GROUPS = 12;
    private static final int TOP_PIS = 12;
    private static final int TOP_ROOMS = 15;
    private static final int TOP_REGIONS = 10;

    private final AnalyticsUserViewMapper viewMapper;
    private final AnalyticsAuditLogMapper auditLogMapper;
    private final AnalyticsAuditService auditService;
    private final AnalyticsInsightPayloadService payloadService;
    private final ObjectMapper objectMapper;

    public AnalyticsChatContextService(
            AnalyticsUserViewMapper viewMapper,
            AnalyticsAuditLogMapper auditLogMapper,
            AnalyticsAuditService auditService,
            AnalyticsInsightPayloadService payloadService,
            ObjectMapper objectMapper) {
        this.viewMapper = viewMapper;
        this.auditLogMapper = auditLogMapper;
        this.auditService = auditService;
        this.payloadService = payloadService;
        this.objectMapper = objectMapper;
    }

    public boolean isReportScope(long viewId) {
        return viewId == REPORT_SCOPE_VIEW_ID;
    }

    /**
     * 单条清算快照上下文（AI 解读弹窗内追问用）。
     */
    public String buildContextJsonForAuditLog(String userId, long auditLogId) {
        AnalyticsAuditLog row = auditLogMapper.selectById(auditLogId);
        if (row == null || !userId.equals(row.getUserId())) {
            throw new IllegalArgumentException("清算记录不存在");
        }
        Map<String, Object> detail = auditService.getDetailForUser(userId, auditLogId);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("scope", "single_audit_log");
        root.put("auditLogId", auditLogId);
        String reportKey = row.getReportKey() != null ? row.getReportKey().trim() : AnalyticsReportRegistry.REPORT_ISOLATION_USAGE;
        root.put("reportKey", reportKey);
        root.put("moduleLabel", com.example.demo.modules.llm.LlmInsightModules.labelZh(reportKey));
        root.put("metricUnit", AnalyticsInsightPayloadService.metricUnit(reportKey));
        root.put("viewId", row.getViewId());
        root.put("viewName", row.getViewName());
        Map<String, Object> period = compactPeriod(detail, reportKey);
        root.put("period", period);
        Object pl = period.get("periodLabel");
        if (pl != null) {
            root.put("availablePeriodLabels", List.of(String.valueOf(pl)));
        }
        root.put(
                "note",
                "用户针对本条清算快照的追问；请仅基于 period 内数据回答（metricUnit 为统计口径），勿编造。"
                        + "多轮追问其它日期时，若不在 availablePeriodLabels 中须说明封箱无该日，勿称整段无数据。");
        return writeJson(root);
    }

    /**
     * 从封箱 JSON 提取各配置可用 periodLabel，供 LLM 多轮对话按日期检索。
     */
    public String buildPeriodIndexHint(String contextJson) {
        if (!StringUtils.hasText(contextJson)) {
            return "";
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = objectMapper.readValue(contextJson, Map.class);
            String scope = root.get("scope") != null ? String.valueOf(root.get("scope")) : "";
            if ("single_audit_log".equals(scope)) {
                Object labels = root.get("availablePeriodLabels");
                if (labels instanceof List<?> list && !list.isEmpty()) {
                    return "【封箱期次索引】本条快照 periodLabel=" + list.get(0)
                            + "。用户追问其它日期时，若不在此列表须说明封箱无该日快照。";
                }
                return "";
            }
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> views = root.get("views") instanceof List<?> vl
                    ? (List<Map<String, Object>>) vl
                    : List.of();
            if (views.isEmpty()) {
                return "";
            }
            StringBuilder sb = new StringBuilder();
            sb.append("【封箱期次索引】多轮对话须结合用户提到的日期，在对应 view 的 periodCatalog/periods 中按 periodType+periodLabel 查找；")
                    .append("缺失日期须说明「封箱中无该日快照」并引用下列可用标签，勿称整段无数据。\n");
            for (Map<String, Object> view : views) {
                String viewName = view.get("viewName") != null ? String.valueOf(view.get("viewName")) : "配置";
                if (Boolean.TRUE.equals(view.get("periodLabelTruncated"))) {
                    sb.append("- ").append(viewName).append("：封箱含全部期次摘要(periodCatalog)，")
                            .append("仅部分期次含完整维度(periods)，见 availablePeriodLabels。\n");
                }
                appendLabelsByType(sb, viewName, "day", labelsForType(view, "day"));
                appendLabelsByType(sb, viewName, "week", labelsForType(view, "week"));
                appendLabelsByType(sb, viewName, "month", labelsForType(view, "month"));
            }
            return sb.toString().trim();
        } catch (Exception e) {
            return "";
        }
    }

    private static void appendLabelsByType(StringBuilder sb, String viewName, String periodType, List<String> labels) {
        if (labels.isEmpty()) {
            return;
        }
        String preview =
                labels.size() > 24
                        ? String.join(", ", labels.subList(0, 12))
                                + " … "
                                + String.join(", ", labels.subList(labels.size() - 8, labels.size()))
                        : String.join(", ", labels);
        sb.append("- ")
                .append(viewName)
                .append(" · ")
                .append(periodType)
                .append("（")
                .append(labels.size())
                .append(" 期）：")
                .append(preview)
                .append("\n");
    }

    @SuppressWarnings("unchecked")
    private static List<String> labelsForType(Map<String, Object> view, String periodType) {
        Object byType = view.get("availablePeriodLabels");
        if (byType instanceof Map<?, ?> map) {
            Object list = map.get(periodType);
            if (list instanceof List<?> dl) {
                return dl.stream().map(String::valueOf).toList();
            }
        }
        List<String> fromCatalog = new ArrayList<>();
        collectLabelsWithType(view.get("periodCatalog"), periodType, fromCatalog);
        collectLabelsWithType(view.get("periods"), periodType, fromCatalog);
        return fromCatalog.stream().distinct().sorted().toList();
    }

    private static void collectLabelsWithType(Object raw, String periodType, List<String> out) {
        if (!(raw instanceof List<?> periods)) {
            return;
        }
        for (Object p : periods) {
            if (p instanceof Map<?, ?> pm) {
                String type = pm.get("periodType") != null ? String.valueOf(pm.get("periodType")).trim() : "day";
                if (!periodType.equals(type)) {
                    continue;
                }
                Object label = pm.get("periodLabel");
                if (label != null && !String.valueOf(label).isBlank()) {
                    out.add(String.valueOf(label).trim());
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> collectPeriodLabels(Map<String, Object> view) {
        TreeSet<String> sorted = new TreeSet<>();
        collectFromPeriodList(view.get("periodCatalog"), sorted);
        collectFromPeriodList(view.get("periods"), sorted);
        if (!sorted.isEmpty()) {
            return new ArrayList<>(sorted);
        }
        Object direct = view.get("availablePeriodLabels");
        if (direct instanceof Map<?, ?> map) {
            for (Object list : map.values()) {
                if (list instanceof List<?> dl) {
                    dl.forEach(x -> sorted.add(String.valueOf(x).trim()));
                }
            }
            return new ArrayList<>(sorted);
        }
        if (direct instanceof List<?> dl) {
            return dl.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    private static void collectFromPeriodList(Object raw, TreeSet<String> sorted) {
        if (!(raw instanceof List<?> periods)) {
            return;
        }
        for (Object p : periods) {
            if (p instanceof Map<?, ?> pm) {
                Object label = pm.get("periodLabel");
                if (label != null && !String.valueOf(label).isBlank()) {
                    sorted.add(String.valueOf(label).trim());
                }
            }
        }
    }

    public boolean isSingleAuditLogContext(String contextJson) {
        if (!StringUtils.hasText(contextJson)) {
            return false;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = objectMapper.readValue(contextJson, Map.class);
            return "single_audit_log".equals(m.get("scope"));
        } catch (Exception e) {
            return false;
        }
    }

    public Long auditLogIdFromContext(String contextJson) {
        if (!StringUtils.hasText(contextJson)) {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = objectMapper.readValue(contextJson, Map.class);
            Object id = m.get("auditLogId");
            if (id instanceof Number n) {
                return n.longValue();
            }
            return null;
        } catch (Exception e) {
            return null;
        }
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
                "多轮对话追问日期时须在 periods/availablePeriodLabels 中查找；"
                        + contextNoteForReport(reportKey));
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
                        + "periodCatalog 为全部期次摘要（与页面清算列表同源），periods 为含课题组等完整维度的子集；"
                        + "availablePeriodLabels 按 day/week/month 列出全部期次；"
                        + "多轮对话追问日期时须在 periodCatalog 中查找，缺失则明确说明无该日快照；"
                        + contextNoteForReport(reportKey));
        return writeJson(root);
    }

    private Map<String, Object> buildViewPayload(String userId, String reportKey, AnalyticsUserView view) {
        List<AnalyticsAuditLog> raw = auditLogMapper.selectAllByView(userId, view.getId(), CHAT_AUDIT_FETCH_LIMIT);
        Map<String, AnalyticsAuditLog> deduped = new LinkedHashMap<>();
        for (AnalyticsAuditLog log : raw) {
            String key = log.getPeriodType() + "|" + log.getPeriodLabel();
            AnalyticsAuditLog prev = deduped.get(key);
            if (prev == null
                    || (log.getCreatedAt() != null
                            && prev.getCreatedAt() != null
                            && log.getCreatedAt().isAfter(prev.getCreatedAt()))) {
                deduped.put(key, log);
            }
        }
        List<AnalyticsAuditLog> allPeriods = new ArrayList<>(deduped.values());
        allPeriods.sort(Comparator.comparingLong(this::periodOrderKey));

        List<Map<String, Object>> periodCatalog = new ArrayList<>();
        for (AnalyticsAuditLog row : allPeriods) {
            periodCatalog.add(compactFromListRow(row));
        }

        List<AnalyticsAuditLog> fullDetailRows = selectFullDetailRows(allPeriods);
        List<Map<String, Object>> periodPayloads = new ArrayList<>();
        for (AnalyticsAuditLog row : fullDetailRows) {
            try {
                Map<String, Object> detail = auditService.getDetailForUser(userId, row.getId());
                periodPayloads.add(compactPeriod(detail, reportKey));
            } catch (Exception ignored) {
                periodPayloads.add(compactFromListRow(row));
            }
        }
        periodPayloads.sort(Comparator.comparing(p -> String.valueOf(p.get("periodLabel"))));

        Map<String, List<String>> labelsByType = groupLabelsByType(allPeriods);

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("viewId", view.getId());
        m.put("viewName", view.getName());
        m.put("filterJson", view.getFilterJson());
        m.put("periodCountTotal", allPeriods.size());
        m.put("periodCountFullDetail", periodPayloads.size());
        m.put("periodCatalog", periodCatalog);
        m.put("periods", periodPayloads);
        m.put("availablePeriodLabels", labelsByType);
        if (allPeriods.size() > fullDetailRows.size()) {
            m.put("periodLabelTruncated", true);
            m.put(
                    "periodDetailNote",
                    "periodCatalog 含全部 "
                            + allPeriods.size()
                            + " 期清算摘要；periods 含 "
                            + periodPayloads.size()
                            + " 期完整维度。分析人员比例等请优先查 periodCatalog 中对应 periodLabel。");
        }
        return m;
    }

    /** 与页面清算列表一致：按周期时间升序；完整维度条数有上限时保留全部周/月 + 尽量多日粒度 */
    private List<AnalyticsAuditLog> selectFullDetailRows(List<AnalyticsAuditLog> allPeriods) {
        if (allPeriods.size() <= MAX_FULL_DETAIL_PERIODS) {
            return new ArrayList<>(allPeriods);
        }
        List<AnalyticsAuditLog> nonDay = allPeriods.stream()
                .filter(r -> !"day".equals(normalizePeriodType(r.getPeriodType())))
                .toList();
        List<AnalyticsAuditLog> days = allPeriods.stream()
                .filter(r -> "day".equals(normalizePeriodType(r.getPeriodType())))
                .toList();
        List<AnalyticsAuditLog> picked = new ArrayList<>(nonDay);
        int dayBudget = Math.max(0, MAX_FULL_DETAIL_PERIODS - nonDay.size());
        if (days.size() <= dayBudget) {
            picked.addAll(days);
        } else {
            // 完整维度优先保留最近日粒度；更早日期仍在 periodCatalog 摘要中
            picked.addAll(days.subList(days.size() - dayBudget, days.size()));
        }
        picked.sort(Comparator.comparingLong(this::periodOrderKey));
        return picked;
    }

    private static Map<String, List<String>> groupLabelsByType(List<AnalyticsAuditLog> allPeriods) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        out.put("day", labelList(allPeriods, "day"));
        out.put("week", labelList(allPeriods, "week"));
        out.put("month", labelList(allPeriods, "month"));
        return out;
    }

    private static List<String> labelList(List<AnalyticsAuditLog> allPeriods, String periodType) {
        return allPeriods.stream()
                .filter(r -> periodType.equals(normalizePeriodType(r.getPeriodType())))
                .map(AnalyticsAuditLog::getPeriodLabel)
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .sorted()
                .collect(Collectors.toList());
    }

    private static String normalizePeriodType(String periodType) {
        return periodType != null && !periodType.isBlank() ? periodType.trim() : "day";
    }

    private long periodOrderKey(AnalyticsAuditLog log) {
        String type = normalizePeriodType(log.getPeriodType());
        String label = log.getPeriodLabel() != null ? log.getPeriodLabel().trim() : "";
        if (!StringUtils.hasText(label)) {
            return 0L;
        }
        try {
            return switch (type) {
                case "day" -> LocalDate.parse(label).toEpochDay() * 10L;
                case "week" -> parseWeekMonday(label).toEpochDay() * 10L + 1L;
                case "month" -> YearMonth.parse(label).atDay(1).toEpochDay() * 10L + 2L;
                default -> 0L;
            };
        } catch (Exception e) {
            return 0L;
        }
    }

    private static LocalDate parseWeekMonday(String periodLabel) {
        int dash = periodLabel.indexOf("-W");
        if (dash < 0) {
            throw new IllegalArgumentException("invalid week label");
        }
        int year = Integer.parseInt(periodLabel.substring(0, dash));
        int week = Integer.parseInt(periodLabel.substring(dash + 2));
        return LocalDate.of(year, 1, 1)
                .with(ISO_WEEK.weekOfWeekBasedYear(), week)
                .with(ISO_WEEK.dayOfWeek(), 1);
    }

    private String writeJson(Map<String, Object> root) {
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new IllegalStateException("封箱统计数据失败: " + e.getMessage());
        }
    }

    private static String contextNoteForReport(String reportKey) {
        if (AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(reportKey)) {
            return "byProjectGroup 为课题组，byPi 为 PI 课题组，byRoom 为各房间笼位数，byRegion 为区域汇总；可跨期比较。";
        }
        return "主口径 currentRounds/uniqueUsers 为清洗总库条数与涉及人数；uniqueGroups/uniqueStudentUsers 为 ARO 流水课题组与涉及学生人数（与 byProjectGroup 一致）；"
                + "aroFlowRooms 为 ARO 学生流水辅助下进入的房间类型（勿与主条数对账）；byProjectGroup 为课题组分布；可跨期比较。";
    }

    private Map<String, Object> compactPeriod(Map<String, Object> detail, String reportKey) {
        Map<String, Object> m = payloadService.compactSnapshot(detail, reportKey);
        if (m.get("byProjectGroup") instanceof List<?> g && g.size() > TOP_GROUPS) {
            m.put("byProjectGroup", g.subList(0, TOP_GROUPS));
        }
        if (AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(reportKey)) {
            if (m.get("byPi") instanceof List<?> p && p.size() > TOP_PIS) {
                m.put("byPi", p.subList(0, TOP_PIS));
            }
            if (m.get("byRoom") instanceof List<?> r && r.size() > TOP_ROOMS) {
                m.put("byRoom", r.subList(0, TOP_ROOMS));
            }
        } else if (m.get("aroFlowRooms") instanceof List<?> r && r.size() > TOP_ROOMS) {
            m.put("aroFlowRooms", r.subList(0, TOP_ROOMS));
        }
        if (m.get("byRegion") instanceof List<?> reg && reg.size() > TOP_REGIONS) {
            m.put("byRegion", reg.subList(0, TOP_REGIONS));
        }
        return m;
    }

    private Map<String, Object> compactFromListRow(AnalyticsAuditLog row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("auditLogId", row.getId());
        m.put("periodType", row.getPeriodType());
        m.put("periodLabel", row.getPeriodLabel());
        m.put("currentRounds", row.getCurrentRounds());
        m.put("previousRounds", row.getPreviousRounds());
        m.put("currentUsers", row.getCurrentUsers());
        m.put("previousUsers", row.getPreviousUsers());
        m.put("currentGroups", row.getCurrentGroups());
        m.put("previousGroups", row.getPreviousGroups());
        m.put("deltaRounds", row.getDeltaRounds());
        m.put("deltaPct", row.getDeltaPct());
        mergeSummaryFromSnapshotJson(row.getTopGroupsJson(), m);
        return m;
    }

    @SuppressWarnings("unchecked")
    private void mergeSummaryFromSnapshotJson(String topGroupsJson, Map<String, Object> target) {
        if (!StringUtils.hasText(topGroupsJson)) {
            return;
        }
        try {
            Map<String, Object> snap = objectMapper.readValue(topGroupsJson, Map.class);
            Object summary = snap.get("summary");
            if (!(summary instanceof Map<?, ?> s)) {
                return;
            }
            copyIfNumber(s, target, "studentSets");
            copyIfNumber(s, target, "staffSets");
            copyIfNumber(s, target, "uniqueStudentUsers");
            copyIfNumber(s, target, "uniqueUsers");
            copyIfNumber(s, target, "uniqueGroups");
        } catch (Exception ignored) {
            // ignore malformed snapshot
        }
    }

    private static void copyIfNumber(Map<?, ?> from, Map<String, Object> to, String key) {
        Object v = from.get(key);
        if (v instanceof Number) {
            to.put(key, v);
        }
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
