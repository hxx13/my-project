package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryLongtermSampleLogRow {
    private Long id;
    private LocalDateTime runAt;
    private String outcome;
    private Integer rowsWritten;
    private String reason;
    private Long durationMs;
    private LocalDateTime createdAt;
}
