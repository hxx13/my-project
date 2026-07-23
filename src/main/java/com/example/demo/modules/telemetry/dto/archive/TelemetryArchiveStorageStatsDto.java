package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TelemetryArchiveStorageStatsDto {
    private long totalRows;
    private Double tableSizeMb;
    private String oldestSampleAt;
    private String newestSampleAt;
    private long rowsOlderThanRetention;
    private int effectiveRetentionDays;
    /** true 时 totalRows 来自 information_schema.table_rows（估算） */
    private boolean approximate;
}
