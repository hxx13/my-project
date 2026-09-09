package com.example.demo.modules.telemetry.dto.archive;

import lombok.Data;

import java.time.LocalDateTime;

/** 归档表按 room×15min 桶聚合（分区 sparkline，avg 为桶内代表值） */
@Data
public class TelemetryPartitionAggRow {
    private String roomCanonical;
    private LocalDateTime bucketStart;
    private Double avgValue;
}
