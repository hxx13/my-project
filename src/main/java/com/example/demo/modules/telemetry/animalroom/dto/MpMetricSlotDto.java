package com.example.demo.modules.telemetry.animalroom.dto;

import com.example.demo.modules.telemetry.dto.TelemetryTagItemDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MpMetricSlotDto {
    private String metricKindCode;
    private String metricKindLabel;
    private TelemetryTagItemDto item;
}
