package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryLongtermSampleRow {
    private Long id;
    private LocalDateTime sampleAt;
    private String variableName;
    private Double numericValue;
    private String rawValue;
    private String metricKindCode;
    private String roomCanonical;
    private String floorCode;
    private String bundleCode;
    private LocalDateTime snapshotAt;
    private String tickBatchId;
    private LocalDateTime createdAt;
}
