package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** 长期归档明细分页（字段命名与既有分页 DTO 一致）。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermQueryPageDto {
    private long total;
    private int page;
    private int size;
    private List<TelemetryLongtermSampleDto> items;
}
