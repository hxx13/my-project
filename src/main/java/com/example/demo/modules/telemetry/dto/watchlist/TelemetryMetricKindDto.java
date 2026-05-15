package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryMetricKindDto {
    private Long id;
    private String code;
    private String labelZh;
    /** METRIC | LIMIT_MIN | LIMIT_MAX | SWITCH | SETPOINT；码 STATUS(状态) 为测量值，展示 1/0 为 开/关 */
    private String kindRole;
    private Integer sortOrder;
    private Boolean builtin;
    private Boolean active;
}
