package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryValueArchiveRow {
    private Long id;
    private LocalDateTime sampleAt;
    private String variableName;
    private Double numericValue;
    private String rawValue;
    private String metricKindCode;
    private String roomCanonical;
    private String bundleCode;
    private Integer schemaVersion;
    private String ingestBatchId;
    private String extJson;
}
