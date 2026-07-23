package com.example.demo.modules.telemetry.dto.archive;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryChartGroupVariableMetaDto {
    private String variableName;
    private String displayLabel;
    private String floorCode;
    private String metricKindCode;
    private String bundleCode;
    private String roomCanonical;
}
