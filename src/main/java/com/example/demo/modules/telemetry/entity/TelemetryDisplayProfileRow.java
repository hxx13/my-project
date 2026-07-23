package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryDisplayProfileRow {
    private String code;
    private String label;
    private String configJson;
    private LocalDateTime updateTime;
}
