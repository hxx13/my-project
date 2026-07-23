package com.example.demo.modules.telemetry.dto.archive;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryArchivePointDto {
    /** ISO-8601 */
    private String t;
    private Double value;
}
