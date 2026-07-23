package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryChartGroupRow {
    private Long id;
    private String name;
    private String description;
    private String variableNamesJson;
    private String variableMetadataJson;
    private String layoutMode;
    private String source;
    private Integer sortOrder;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
