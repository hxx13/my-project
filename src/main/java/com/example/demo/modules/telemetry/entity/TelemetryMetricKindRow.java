package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryMetricKindRow {
    private Long id;
    private String code;
    private String labelZh;
    /** METRIC | LIMIT_MIN | LIMIT_MAX | SWITCH | SETPOINT */
    private String kindRole;
    private Integer sortOrder;
    private Integer builtin;
    private Integer active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
