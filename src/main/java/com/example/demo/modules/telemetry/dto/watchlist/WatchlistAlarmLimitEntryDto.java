package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 二次封装接口返回的单变量报警限视图（数据仅来自 WinCC 变量库缓存列）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WatchlistAlarmLimitEntryDto {

    private String variableName;
    private String alarmMinValue;
    private String alarmMaxValue;
    private String alarmMinVariableName;
    private String alarmMaxVariableName;
    /** 请求方传入当前测量值时可计算；否则为 null */
    private Boolean alarmOutOfRange;
    /** HIGH | LOW | OK */
    private String alarmBand;
}
