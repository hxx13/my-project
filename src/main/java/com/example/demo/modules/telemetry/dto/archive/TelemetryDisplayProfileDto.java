package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TelemetryDisplayProfileDto {
    private String code;
    private String label;
    private String configJson;
    private String updateTime;
}
