package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.Data;

@Data
public class TelemetryMetricKindWriteDto {
    private String code;
    private String labelZh;
    /** METRIC | LIMIT_MIN | LIMIT_MAX | SWITCH | SETPOINT */
    private String kindRole;
    private Integer sortOrder;
    private Boolean active;
}
