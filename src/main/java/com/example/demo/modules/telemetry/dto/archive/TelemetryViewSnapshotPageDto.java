package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class TelemetryViewSnapshotPageDto {
    private long total;
    private int page;
    private int size;
    private List<TelemetryViewSnapshotDto> items;
}
