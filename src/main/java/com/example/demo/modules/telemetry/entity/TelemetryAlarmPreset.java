package com.example.demo.modules.telemetry.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TelemetryAlarmPreset {
    private Long id;
    private String name;
    private String description;
    private String floorCode;
    private String tempMin;
    private String tempMax;
    private String humMin;
    private String humMax;
    private String pressureMin;
    private String pressureMax;
    private String hysteresisTemp;
    private String hysteresisHum;
    private String hysteresisPressure;
    private Integer alarmCooldownMinutes;
    private Integer isGlobal;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
