package com.example.demo.modules.telemetry.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TelemetryFloorAlarmConfig {
    private Long id;
    private String floorCode;
    private Integer enabled;
    private Integer cooldownMinutes;
    private Integer notifyOnRecovery;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
