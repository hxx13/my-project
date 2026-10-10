package com.example.demo.modules.telemetry.dto.longterm;

import lombok.Data;

/** 已选变量（前端表格与 AI 工具共用同一种形状）。 */
@Data
public class TelemetryLongtermVariableDto {
    private String winccVariableName;
    private int sortOrder;
    private String displayLabel;
    private String unit;
    private boolean enabled;
    private String floorCode;
    private String roomCanonical;
    private String metricKindCode;
    private String metricKindLabel;
}
