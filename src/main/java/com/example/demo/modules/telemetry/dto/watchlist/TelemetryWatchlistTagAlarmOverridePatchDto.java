package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.Data;

/** PATCH 每点报警限覆盖；字段可空表示清空该侧覆盖 */
@Data
public class TelemetryWatchlistTagAlarmOverridePatchDto {
    private Long tagId;
    private Long bundleId;
    private String alarmOverrideMin;
    private String alarmOverrideMax;
    private Integer alarmCooldownMinutes;
}
