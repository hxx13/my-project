package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 动物房全局报警限：温度 / 湿度 / 压强各一对上下限（字符串与前端一致，可含小数） */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryGlobalAlarmLimitsDto {
    private String tempMin;
    private String tempMax;
    private String humMin;
    private String humMax;
    private String pressureMin;
    private String pressureMax;
}
