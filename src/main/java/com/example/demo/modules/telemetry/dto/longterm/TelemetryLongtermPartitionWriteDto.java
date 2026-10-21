package com.example.demo.modules.telemetry.dto.longterm;

import lombok.Data;

/** 自定义分区的新增/改名请求。 */
@Data
public class TelemetryLongtermPartitionWriteDto {
    private String name;
}
