package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryViewSnapshotRow {
    private Long id;
    private LocalDateTime capturedAt;
    private String profileCode;
    private String timeRangeJson;
    private Long chartGroupId;
    private String payloadJson;
    private LocalDateTime createTime;
}
