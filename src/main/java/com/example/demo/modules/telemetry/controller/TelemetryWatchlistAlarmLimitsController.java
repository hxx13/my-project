package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.telemetry.dto.watchlist.WatchlistAlarmLimitsBatchDto;
import com.example.demo.modules.telemetry.dto.watchlist.WatchlistAlarmLimitsQueryRequest;
import com.example.demo.modules.telemetry.service.WatchlistAlarmLimitsFacadeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 报警上下限批量查询：与快照同源——全局限 + 库内 {@code alarm_override_min/max} 覆盖。
 */
@RestController
@RequestMapping("/api/v1/telemetry/watchlists/alarm-limits")
@CrossOrigin(origins = "*")
@Tag(name = "WinCC变量报警限", description = "基于变量库的上下限查询（与快照分离）")
public class TelemetryWatchlistAlarmLimitsController {

    private final WatchlistAlarmLimitsFacadeService alarmLimitsFacade;

    public TelemetryWatchlistAlarmLimitsController(WatchlistAlarmLimitsFacadeService alarmLimitsFacade) {
        this.alarmLimitsFacade = alarmLimitsFacade;
    }

    @PostMapping("/query")
    @Operation(summary = "批量查询报警上下限", description = "先套用全局限，再合并每点覆盖列；可选传入当前测量值以计算越界与 HIGH/LOW/OK。")
    public Result<WatchlistAlarmLimitsBatchDto> query(@RequestBody WatchlistAlarmLimitsQueryRequest body) {
        List<String> names = body != null ? body.getVariableNames() : null;
        List<String> cleaned = new ArrayList<>();
        if (names != null) {
            for (String n : names) {
                if (StringUtils.hasText(n)) {
                    cleaned.add(n.trim());
                }
            }
        }
        WatchlistAlarmLimitsBatchDto dto = alarmLimitsFacade.queryLimits(cleaned,
                body != null ? body.safeCurrentValueByVariable() : Map.of());
        return Result.success(dto);
    }
}
