package com.example.demo.modules.telemetry.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TelemetrySuiteAlarmConfig {
    private Long id;
    private String floorCode;
    private String suiteNorm;
    private Integer enabled;
    private String tempMin;
    private String tempMax;
    private String humMin;
    private String humMax;
    private String pressureMin;
    private String pressureMax;
    private String hysteresisTemp;
    private String hysteresisHum;
    private String hysteresisPressure;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
