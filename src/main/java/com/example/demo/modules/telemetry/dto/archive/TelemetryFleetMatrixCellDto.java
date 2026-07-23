package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TelemetryFleetMatrixCellDto {
    private String roomCanonical;
    private String metricKindCode;
    private String variableName;
    /** watchlist 展示映射名称 */
    private String displayLabel;
    private String floorCode;
    private String bundleCode;
    private Double latestValue;
    private Double minValue;
    private Double maxValue;
    private Double avgValue;
    private Long sampleCount;
    /** 0~1 合规率（在报警带内采样占比） */
    private Double complianceRate;
    /** HIGH | LOW | OK | UNKNOWN */
    private String complianceStatus;
    private Double maxDeviation;
}
