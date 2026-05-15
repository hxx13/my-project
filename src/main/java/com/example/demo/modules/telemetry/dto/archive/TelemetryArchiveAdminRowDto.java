package com.example.demo.modules.telemetry.dto.archive;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryArchiveAdminRowDto {
    private Long id;
    private String sampleAt;
    private String variableName;
    private Double numericValue;
    private String rawValue;
    private String metricKindCode;
    private String roomCanonical;
    private String bundleCode;
}
