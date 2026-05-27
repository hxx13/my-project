package com.example.demo.modules.analytics.service;

import com.example.demo.modules.analytics.entity.AnalyticsAuditLog;
import com.example.demo.modules.analytics.mapper.AnalyticsAuditLogMapper;
import com.example.demo.modules.llm.LlmInsightModules;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 单条清算快照的 AI 解读/追问「数据包」封箱（与页面 reportKey、快照 JSON 一致）。
 */
@Service
public class AnalyticsInsightPayloadService {

    private final AnalyticsAuditService auditService;
    private final AnalyticsAuditLogMapper auditLogMapper;
    private final ObjectMapper objectMapper;

    public AnalyticsInsightPayloadService(
            AnalyticsAuditService auditService,
            AnalyticsAuditLogMapper auditLogMapper,
            ObjectMapper objectMapper) {
        this.auditService = auditService;
        this.auditLogMapper = auditLogMapper;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> buildDataPackage(String userId, long auditLogId) {
        AnalyticsAuditLog row = requireAuditLog(userId, auditLogId);
        String reportKey = normalizeReportKey(row.getReportKey());
        Map<String, Object> detail = auditService.getDetailForUser(userId, auditLogId);
        Map<String, Object> snapshot = compactSnapshot(detail, reportKey);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("auditLogId", auditLogId);
        out.put("reportKey", reportKey);
        out.put("moduleLabel", LlmInsightModules.labelZh(reportKey));
        out.put("metricUnit", metricUnit(reportKey, snapshot));
        out.put("periodLabel", row.getPeriodLabel());
        out.put("periodType", row.getPeriodType());
        out.put("viewId", row.getViewId());
        out.put("viewName", row.getViewName());
        out.put("snapshot", snapshot);
        out.put("snapshotJson", writeJson(snapshot));
        out.put("summaryPreview", buildSummaryPreview(snapshot, reportKey));
        return out;
    }

    public String buildSnapshotJson(String userId, long auditLogId) {
        AnalyticsAuditLog row = requireAuditLog(userId, auditLogId);
        Map<String, Object> detail = auditService.getDetailForUser(userId, auditLogId);
        return writeJson(compactSnapshot(detail, normalizeReportKey(row.getReportKey())));
    }

    public Map<String, Object> compactSnapshot(Map<String, Object> detail, String reportKey) {
        String rk = normalizeReportKey(reportKey);
        boolean cage = AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(rk);
        Map<String, Object> compact = new LinkedHashMap<>();
        compact.put("reportKey", rk);
        compact.put("metricUnit", metricUnit(rk, detail));
        compact.put("periodLabel", detail.get("periodLabel"));
        compact.put("periodType", detail.get("periodType"));
        compact.put("viewName", detail.get("viewName"));
        compact.put("currentRounds", detail.get("currentRounds"));
        compact.put("previousRounds", detail.get("previousRounds"));
        compact.put("deltaRounds", detail.get("deltaRounds"));
        compact.put("deltaPct", detail.get("deltaPct"));
        compact.put("summary", detail.get("summary"));
        compact.put("byProjectGroup", topN(detail.get("byProjectGroup"), 15));
        compact.put("byRegion", topN(detail.get("byRegion"), 10));
        if (cage) {
            compact.put("byPi", topN(detail.get("byPi"), 12));
            compact.put("byRoom", topN(detail.get("byRoom"), 15));
        } else {
            Map<String, Object> aux = auxiliaryFlowMap(detail.get("auxiliaryFlow"));
            if (!aux.isEmpty()) {
                compact.put("auxiliaryFlow", aux);
                compact.put("aroFlowRooms", topN(aux.get("byRoom"), 20));
            }
        }
        if (detail.get("summary") instanceof Map<?, ?> summary) {
            @SuppressWarnings("unchecked")
            Map<String, Object> s = (Map<String, Object>) summary;
            Object ds = s.get("dataSource");
            if (ds != null) {
                compact.put("dataSource", ds);
            }
            if ("cleaned".equals(ds)) {
                compact.put(
                        "metricNote",
                        "人次基于大华摆闸清洗（门禁规则/去抖推断），与 ARO 登记可能短期不一致；低置信事件见门禁清洗待复核。");
            } else if ("access_package".equals(ds)) {
                compact.put(
                        "metricNote",
                        "主条数=清洗总库纳入记录（全部进出合计）；学生/工作人员按 audience_type；ARO 流水辅助仅参考，不与主条数对账。");
            }
        }
        if (detail.get("dataQuality") instanceof Map<?, ?> dq) {
            compact.put("dataQuality", dq);
        }
        return compact;
    }

    public static String metricUnit(String reportKey) {
        if (AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(normalizeReportKey(reportKey))) {
            return "笼位";
        }
        return "条";
    }

    private static String metricUnit(String reportKey, Map<String, Object> detailOrSnapshot) {
        if (AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(normalizeReportKey(reportKey))) {
            return "笼位";
        }
        Object summaryObj = detailOrSnapshot != null ? detailOrSnapshot.get("summary") : null;
        if (summaryObj instanceof Map<?, ?> sm) {
            @SuppressWarnings("unchecked")
            Map<String, Object> s = (Map<String, Object>) sm;
            if ("cleaned".equals(String.valueOf(s.get("dataSource")))
                    || "aro".equals(String.valueOf(s.get("dataSource")))) {
                return "人次";
            }
        }
        Object ds = detailOrSnapshot != null ? detailOrSnapshot.get("dataSource") : null;
        if ("cleaned".equals(String.valueOf(ds)) || "aro".equals(String.valueOf(ds))) {
            return "人次";
        }
        return "条";
    }

    private AnalyticsAuditLog requireAuditLog(String userId, long auditLogId) {
        AnalyticsAuditLog row = auditLogMapper.selectById(auditLogId);
        if (row == null || !userId.equals(row.getUserId())) {
            throw new IllegalArgumentException("清算记录不存在");
        }
        return row;
    }

    private static String normalizeReportKey(String reportKey) {
        if (reportKey == null || reportKey.isBlank()) {
            return LlmInsightModules.ISOLATION_USAGE;
        }
        return reportKey.trim();
    }

    private String buildSummaryPreview(Map<String, Object> snapshot, String reportKey) {
        String rk = normalizeReportKey(reportKey);
        String unit = metricUnit(rk, snapshot);
        long cur = toLong(snapshot.get("currentRounds"));
        long prev = toLong(snapshot.get("previousRounds"));
        long delta = toLong(snapshot.get("deltaRounds"));
        Object deltaPctObj = snapshot.get("deltaPct");

        @SuppressWarnings("unchecked")
        Map<String, Object> summary =
                snapshot.get("summary") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();

        String periodType = str(snapshot.get("periodType"));
        String periodLabel = str(snapshot.get("periodLabel"));
        String cycleLabel = periodTypeLabel(periodType);

        if (AnalyticsReportRegistry.REPORT_CAGE_OCCUPANCY.equals(rk)) {
            int pis = sizeOf(snapshot.get("byPi"));
            int rooms = sizeOf(snapshot.get("byRoom"));
            return String.format(
                    "【%s %s】本期占用 %d %s（上期 %d %s）。%s。涉及 PI 课题组 %d 个、房间 %d 个。",
                    cycleLabel,
                    periodLabel,
                    cur,
                    unit,
                    prev,
                    unit,
                    buildPeriodComparisonNarrative(cur, prev, delta, deltaPctObj, unit, summary, false),
                    pis,
                    rooms);
        }

        int uniqueGroups = intFrom(summary, "uniqueGroups");
        int uniqueUsers = intFrom(summary, "uniqueUsers");
        int aroRoomKinds = countAroFlowRoomKinds(snapshot);
        long student = longFrom(summary, "studentEvents", "studentSets");
        long staff = longFrom(summary, "staffEvents", "staffSets");

        String audience =
                student > 0 || staff > 0
                        ? String.format("其中学生 %d %s、工作人员 %d %s。", student, unit, staff, unit)
                        : "";

        return String.format(
                "【%s %s】本期清洗纳入 %d %s（上期 %d %s）。%s %s本期涉及课题组 %d 个、刷卡人员 %d 人；ARO 学生流水辅助口径下进入的房间类型共 %d 种（仅作参考，不与主条数对账）。",
                cycleLabel,
                periodLabel,
                cur,
                unit,
                prev,
                unit,
                buildPeriodComparisonNarrative(cur, prev, delta, deltaPctObj, unit, summary, true),
                audience,
                uniqueGroups,
                uniqueUsers,
                aroRoomKinds);
    }

    private static String buildPeriodComparisonNarrative(
            long cur,
            long prev,
            long delta,
            Object deltaPctObj,
            String unit,
            Map<String, Object> summary,
            boolean accessPackage) {
        StringBuilder sb = new StringBuilder();
        if (prev <= 0 && cur <= 0) {
            sb.append("本期与上期均无纳入记录。");
            return sb.toString();
        }
        if (prev <= 0) {
            sb.append("上期为 0，本期为新纳入数据，无法计算环比百分比。");
            return sb.toString();
        }
        String direction;
        if (delta > 0) {
            direction = "上升";
        } else if (delta < 0) {
            direction = "下降";
        } else {
            direction = "持平";
        }
        sb.append("较上期").append(direction).append(" ").append(Math.abs(delta)).append(" ").append(unit);
        if (deltaPctObj instanceof Number n) {
            BigDecimal pct = BigDecimal.valueOf(n.doubleValue()).setScale(2, RoundingMode.HALF_UP);
            sb.append("（环比 ").append(pct.stripTrailingZeros().toPlainString()).append("%）");
        } else if (delta != 0) {
            BigDecimal pct =
                    BigDecimal.valueOf(delta * 100.0 / prev).setScale(2, RoundingMode.HALF_UP);
            sb.append("（环比 ").append(pct.stripTrailingZeros().toPlainString()).append("%）");
        } else {
            sb.append("（环比 0%）");
        }
        sb.append("。");
        if (accessPackage) {
            sb.append("主口径为门禁清洗总库按通道筛选的纳入记录条数，不按进出方向筛门禁；");
            Object note = summary.get("metricNote");
            if (note != null && StringUtils.hasText(String.valueOf(note))) {
                sb.append(String.valueOf(note));
            }
        }
        return sb.toString();
    }

    private static String periodTypeLabel(String periodType) {
        if (periodType == null) {
            return "清算";
        }
        return switch (periodType) {
            case "day" -> "每日清算";
            case "week" -> "每周清算";
            case "month" -> "每月清算";
            default -> "清算";
        };
    }

    private static int countAroFlowRoomKinds(Map<String, Object> snapshot) {
        Object aux = snapshot.get("auxiliaryFlow");
        if (!(aux instanceof Map<?, ?> auxMap)) {
            Object rooms = snapshot.get("aroFlowRooms");
            return sizeOf(rooms);
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> flow = (Map<String, Object>) auxMap;
        return sizeOf(flow.get("byRoom"));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> auxiliaryFlowMap(Object raw) {
        if (!(raw instanceof Map<?, ?> m)) {
            return Map.of();
        }
        return (Map<String, Object>) m;
    }

    private static int intFrom(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof Number n) {
            return n.intValue();
        }
        return 0;
    }

    private static long longFrom(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object v = map.get(key);
            if (v instanceof Number n) {
                return n.longValue();
            }
        }
        return 0L;
    }

    private static long toLong(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        return 0L;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static int sizeOf(Object raw) {
        if (raw instanceof List<?> list) {
            return list.size();
        }
        return 0;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> topN(Object raw, int limit) {
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
            if (out.size() >= limit) {
                break;
            }
        }
        return out;
    }

    private String writeJson(Map<String, Object> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception e) {
            throw new IllegalStateException("封箱 JSON 失败: " + e.getMessage());
        }
    }
}
