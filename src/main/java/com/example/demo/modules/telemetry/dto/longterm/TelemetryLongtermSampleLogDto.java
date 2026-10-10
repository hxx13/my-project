package com.example.demo.modules.telemetry.dto.longterm;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 一轮采集的留痕（字段与实体同名，见 Task 2 的 TelemetryLongtermSampleLogRow）。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryLongtermSampleLogDto {
    private LocalDateTime runAt;
    private String outcome;
    private int rowsWritten;
    private String reason;
    private long durationMs;
}
