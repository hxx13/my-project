package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 数据监测页的自定义分区（tab）。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermPartitionDto {
    private Long id;
    private String name;
    private int sortOrder;
    /** 该分区下已选变量数 */
    private int variableCount;
}
