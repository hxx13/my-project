package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class TelemetryPartitionSummaryDto {
    private String partitionKey;
    private String partitionLabel;
    private String metricKindCode;
    private List<TelemetryArchivePointDto> medianPoints;
    private List<TelemetryArchivePointDto> p90Points;
    private String queriedFrom;
    private String queriedTo;
}
