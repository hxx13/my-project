package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryGlobalAlarmLimitsRow {
    private Integer id;
    private String tempMin;
    private String tempMax;
    private String humMin;
    private String humMax;
    private String pressureMin;
    private String pressureMax;
    private LocalDateTime updatedAt;
}
