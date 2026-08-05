package com.example.demo.modules.telemetry.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 动物房报警配置树：楼层 → 套间 → 房间 → 变量
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryAlarmConfigTreeDto {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FloorNode {
        private Long configId;
        private String floorCode;
        private boolean enabled;
        private int cooldownMinutes;
        private boolean notifyOnRecovery;
        private int bufferFlushMinutes;
        private int variableCount;
        private int suiteCount;
        private List<SuiteNode> suites;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SuiteNode {
        private Long configId;
        private String suiteNorm;
        private String floorCode;
        /** null=继承楼层开关 */
        private Boolean enabled;
        private String tempMin;
        private String tempMax;
        private String humMin;
        private String humMax;
        private String pressureMin;
        private String pressureMax;
        private String hysteresisTemp;
        private String hysteresisHum;
        private String hysteresisPressure;
        private boolean hasCustomThresholds;
        private int variableCount;
        private int roomCount;
        private List<RoomNode> rooms;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RoomNode {
        private String roomCanonical;
        private String roomDisplay;
        private int variableCount;
        /** 此房间是否有任何报警指标（TEMP/HUM/PRESSURE） */
        @JsonProperty("hasAlarmMetrics")
        private boolean hasAlarmMetrics;
        private List<TagNode> tags;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TagNode {
        private Long tagId;
        private String variableName;
        /** 展示映射名（telemetry_watchlist_tag.display_label） */
        private String displayLabel;
        private String roomCanonical;
        private String roomDisplay;
        private String metricKindCode;
        private String metricKindLabel;
        /** METRIC | SETPOINT | SWITCH | LIMIT_MIN | LIMIT_MAX */
        private String kindRole;
        /** 是否为报警指标（TEMP/HUM/PRESSURE + METRIC role） */
        @JsonProperty("isAlarmMetric")
        private boolean isAlarmMetric;
        /** 逐变量报警开关：null=继承父级，false=禁用，true=启用 */
        private Boolean alarmEnabled;
        private Integer alarmCooldownMinutes;
        /** 逐测点报警限覆盖（null=无覆盖） */
        private String alarmOverrideMin;
        private String alarmOverrideMax;
        /** 当前有效阈值（解析后的最终值，仅 isAlarmMetric=true 时有值） */
        private String effectiveMinValue;
        private String effectiveMaxValue;
    }

    private List<FloorNode> floors;
    private int totalFloors;
    private int totalSuites;
    private int totalRooms;
    private int totalVariables;
}
