package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class WatchlistAlarmLimitsQueryRequest {

    private List<String> variableNames;
    /** 可选：变量名 → 当前测量值字符串，传入则计算 alarmOutOfRange */
    private Map<String, String> currentValueByVariable;

    public Map<String, String> safeCurrentValueByVariable() {
        return currentValueByVariable != null ? currentValueByVariable : Map.of();
    }
}
