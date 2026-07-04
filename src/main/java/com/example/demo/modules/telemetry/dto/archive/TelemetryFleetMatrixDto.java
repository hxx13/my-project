package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class TelemetryFleetMatrixDto {
    private String queriedFrom;
    private String queriedTo;
    private String metricKindCode;
    private String floorFilter;
    private List<TelemetryFleetMatrixCellDto> cells;
}
