package com.example.demo.modules.telemetry.dto.archive;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryArchiveSeriesDto {
    private String variableName;
    private List<TelemetryArchivePointDto> points;
    /** 本次查询实际时间窗起点（ISO-8601）；ROLLING 时为服务端定窗 */
    private String queriedFrom;
    /** 本次查询实际时间窗终点（ISO-8601） */
    private String queriedTo;
}
