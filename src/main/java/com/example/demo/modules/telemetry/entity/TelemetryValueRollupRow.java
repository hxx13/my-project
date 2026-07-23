package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryValueRollupRow {
    private Long id;
    private LocalDateTime bucketStart;
    private Integer bucketSec;
    private String variableName;
    private Double minValue;
    private Double maxValue;
    private Double avgValue;
    private Integer sampleCount;
}
