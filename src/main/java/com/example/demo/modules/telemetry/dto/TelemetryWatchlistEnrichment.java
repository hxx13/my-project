package com.example.demo.modules.telemetry.dto;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 数据库 watchlist 合并后，按变量名索引的展示与结构化字段（供快照 enrich）。
 */
public class TelemetryWatchlistEnrichment {

    private final Map<String, String> displayLabelByVariable;
    private final Map<String, String> bundleCodeByVariable;
    private final Map<String, String> bundleDisplayNameByVariable;
    private final Map<String, String> floorCodeByVariable;
    private final Map<String, String> roomCanonicalByVariable;
    private final Map<String, String> metricKindCodeByVariable;
    private final Map<String, String> metricKindLabelByVariable;
    /** JOIN telemetry_metric_kind.kind_role */
    private final Map<String, String> metricKindRoleByVariable;
    /** 主测量变量名 → 下限变量名（WinCC 名） */
    private final Map<String, String> alarmMinVariableByParentVariable;
    /** 主测量变量名 → 上限变量名（WinCC 名） */
    private final Map<String, String> alarmMaxVariableByParentVariable;
    /** 首命中分区的 tag 主键 */
    private final Map<String, Long> watchlistTagIdByVariable;
    private final Map<String, String> alarmOverrideMinByVariable;
    private final Map<String, String> alarmOverrideMaxByVariable;

    public TelemetryWatchlistEnrichment(Map<String, String> displayLabelByVariable,
                                        Map<String, String> bundleCodeByVariable,
                                        Map<String, String> bundleDisplayNameByVariable,
                                        Map<String, String> floorCodeByVariable,
                                        Map<String, String> roomCanonicalByVariable,
                                        Map<String, String> metricKindCodeByVariable,
                                        Map<String, String> metricKindLabelByVariable,
                                        Map<String, String> metricKindRoleByVariable,
                                        Map<String, String> alarmMinVariableByParentVariable,
                                        Map<String, String> alarmMaxVariableByParentVariable,
                                        Map<String, Long> watchlistTagIdByVariable,
                                        Map<String, String> alarmOverrideMinByVariable,
                                        Map<String, String> alarmOverrideMaxByVariable) {
        this.displayLabelByVariable = copyMap(displayLabelByVariable);
        this.bundleCodeByVariable = copyMap(bundleCodeByVariable);
        this.bundleDisplayNameByVariable = copyMap(bundleDisplayNameByVariable);
        this.floorCodeByVariable = copyMap(floorCodeByVariable);
        this.roomCanonicalByVariable = copyMap(roomCanonicalByVariable);
        this.metricKindCodeByVariable = copyMap(metricKindCodeByVariable);
        this.metricKindLabelByVariable = copyMap(metricKindLabelByVariable);
        this.metricKindRoleByVariable = copyMap(metricKindRoleByVariable);
        this.alarmMinVariableByParentVariable = copyMap(alarmMinVariableByParentVariable);
        this.alarmMaxVariableByParentVariable = copyMap(alarmMaxVariableByParentVariable);
        this.watchlistTagIdByVariable = copyLongMap(watchlistTagIdByVariable);
        this.alarmOverrideMinByVariable = copyMap(alarmOverrideMinByVariable);
        this.alarmOverrideMaxByVariable = copyMap(alarmOverrideMaxByVariable);
    }

    private static Map<String, String> copyMap(Map<String, String> m) {
        return m == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(m));
    }

    private static Map<String, Long> copyLongMap(Map<String, Long> m) {
        return m == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(m));
    }

    public static TelemetryWatchlistEnrichment empty() {
        Map<String, String> e = Map.of();
        Map<String, Long> ez = Map.of();
        return new TelemetryWatchlistEnrichment(e, e, e, e, e, e, e, e, e, e, ez, e, e);
    }

    public boolean isEmpty() {
        return displayLabelByVariable.isEmpty()
                && bundleCodeByVariable.isEmpty()
                && bundleDisplayNameByVariable.isEmpty()
                && floorCodeByVariable.isEmpty()
                && roomCanonicalByVariable.isEmpty()
                && metricKindCodeByVariable.isEmpty()
                && metricKindLabelByVariable.isEmpty()
                && metricKindRoleByVariable.isEmpty()
                && alarmMinVariableByParentVariable.isEmpty()
                && alarmMaxVariableByParentVariable.isEmpty()
                && watchlistTagIdByVariable.isEmpty()
                && alarmOverrideMinByVariable.isEmpty()
                && alarmOverrideMaxByVariable.isEmpty();
    }

    public Map<String, String> getDisplayLabelByVariable() {
        return displayLabelByVariable;
    }

    public Map<String, String> getBundleCodeByVariable() {
        return bundleCodeByVariable;
    }

    public Map<String, String> getBundleDisplayNameByVariable() {
        return bundleDisplayNameByVariable;
    }

    public Map<String, String> getFloorCodeByVariable() {
        return floorCodeByVariable;
    }

    public Map<String, String> getRoomCanonicalByVariable() {
        return roomCanonicalByVariable;
    }

    public Map<String, String> getMetricKindCodeByVariable() {
        return metricKindCodeByVariable;
    }

    public Map<String, String> getMetricKindLabelByVariable() {
        return metricKindLabelByVariable;
    }

    public Map<String, String> getMetricKindRoleByVariable() {
        return metricKindRoleByVariable;
    }

    public Map<String, String> getAlarmMinVariableByParentVariable() {
        return alarmMinVariableByParentVariable;
    }

    public Map<String, String> getAlarmMaxVariableByParentVariable() {
        return alarmMaxVariableByParentVariable;
    }

    public Map<String, Long> getWatchlistTagIdByVariable() {
        return watchlistTagIdByVariable;
    }

    public Map<String, String> getAlarmOverrideMinByVariable() {
        return alarmOverrideMinByVariable;
    }

    public Map<String, String> getAlarmOverrideMaxByVariable() {
        return alarmOverrideMaxByVariable;
    }
}
