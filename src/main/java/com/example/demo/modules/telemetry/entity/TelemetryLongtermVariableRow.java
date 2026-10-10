package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryLongtermVariableRow {
    private Long id;
    private String winccVariableName;
    private Integer sortOrder;
    private String displayLabel;
    private String unit;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
