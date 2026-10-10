package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 长期归档明细行（前端表格与 AI 工具共用同一种形状）。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermSampleDto {
    private LocalDateTime sampleAt;
    private String variableName;
    private Double numericValue;
    private String rawValue;
    private String unit;
    private String roomCanonical;
    private String floorCode;
    private LocalDateTime snapshotAt;
}
