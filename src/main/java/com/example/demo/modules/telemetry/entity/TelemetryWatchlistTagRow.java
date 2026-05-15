package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryWatchlistTagRow {
    /** JOIN bundle，非表列持久化，仅 select 别名填充 */
    private String bundleCode;
    /** JOIN bundle.display_name */
    private String bundleDisplayName;

    private Long id;
    private Long bundleId;
    private String winccVariableName;
    private String structureType;
    private String dataType;
    private String displayLabel;
    private String floorCode;
    private String roomBase;
    private String roomCanonical;
    private String suiteSuffix;
    private String metricKindCode;
    /** 低频 WinCC 拉取写入的主测量行缓存 */
    private String cachedAlarmMinValue;
    private String cachedAlarmMaxValue;
    private LocalDateTime cachedAlarmLimitsAt;
    /** 每点报警下限覆盖（可空；优先级高于全局限） */
    private String alarmOverrideMin;
    /** 每点报警上限覆盖（可空） */
    private String alarmOverrideMax;
    /** JOIN telemetry_metric_kind.kind_role，非表列 */
    private String metricKindRole;
    /** JOIN telemetry_metric_kind.label_zh，非表列 */
    private String metricKindLabel;
    private Integer enabled;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
