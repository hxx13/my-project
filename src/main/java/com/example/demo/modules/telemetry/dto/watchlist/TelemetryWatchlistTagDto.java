package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryWatchlistTagDto {
    private Long id;
    private String winccVariableName;
    private String structureType;
    private String dataType;
    private String displayLabel;
    private String floorCode;
    private String roomCanonical;
    private String metricKindCode;
    /** 低频拉取缓存（仅展示，保存时不由前端写回） */
    private String cachedAlarmMinValue;
    private String cachedAlarmMaxValue;
    private LocalDateTime cachedAlarmLimitsAt;
    private String alarmOverrideMin;
    private String alarmOverrideMax;
    private boolean enabled;
    private int sortOrder;
}
