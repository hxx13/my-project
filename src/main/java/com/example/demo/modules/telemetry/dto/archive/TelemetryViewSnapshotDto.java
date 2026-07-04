package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TelemetryViewSnapshotDto {
    private Long id;
    private String capturedAt;
    private String profileCode;
    private String timeRangeJson;
    private Long chartGroupId;
    private String payloadJson;
    private String createTime;
}
