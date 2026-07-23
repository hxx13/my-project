package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class TelemetryArchiveSeriesBatchDto {
    private String displayProfile;
    private String queriedFrom;
    private String queriedTo;
    private List<TelemetryArchiveSeriesDto> series;
}
