package com.example.demo.modules.telemetry.dto.longterm;

import lombok.Data;

import java.util.List;

/** 归档计划只读视图。间隔**只读**：唯一权威入口是定时管理。 */
@Data
public class TelemetryLongtermPlanDto {
    private boolean scheduleEnabled;
    private int pollIntervalSeconds;
    private String scheduleStartTime;
    private String scheduleEndTime;
    private long sampleRows;
    private long variableCount;
    private List<TelemetryLongtermSampleLogDto> recentRuns;
}
