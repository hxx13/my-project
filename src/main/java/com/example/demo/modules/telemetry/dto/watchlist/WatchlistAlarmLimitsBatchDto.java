package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.LinkedHashMap;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WatchlistAlarmLimitsBatchDto {

    @Builder.Default
    private Map<String, WatchlistAlarmLimitEntryDto> byVariableName = new LinkedHashMap<>();
}
