package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 长期归档·自定义分区（tab），与 WinCC 变量导入分区无关。 */
@Data
public class TelemetryLongtermPartitionRow {
    private Long id;
    private String name;
    private Integer sortOrder;
    /** 该分区下已选变量数（列表查询时聚合，非表列） */
    private Integer variableCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
