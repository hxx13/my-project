package com.example.demo.modules.telemetry.dto.archive;

import lombok.Data;

import java.time.LocalDateTime;

/** 归档表按 room×metric 聚合（fleet 矩阵） */
@Data
public class TelemetryFleetAggRow {
    private String roomCanonical;
    private String metricKindCode;
    private String variableName;
    private Double latestValue;
    private Double minValue;
    private Double maxValue;
    private Double avgValue;
    private Long sampleCount;
    private LocalDateTime latestAt;
}
