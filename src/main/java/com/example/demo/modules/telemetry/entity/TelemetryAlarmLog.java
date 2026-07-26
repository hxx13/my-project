package com.example.demo.modules.telemetry.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TelemetryAlarmLog {
    private Long id;
    private String variableName;
    private String floorCode;
    private String roomCanonical;
    private String suiteNorm;
    private String metricKind;
    private String alarmBand;
    private String currentValue;
    private String limitValue;
    private LocalDateTime sentAt;
}
