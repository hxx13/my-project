package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** 管理端：一个「分区」= 一次按文件名建档的变量表（如 1F.csv / 2F.csv） */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryWatchlistZoneAdminDto {
    private TelemetryWatchlistBundleDto bundle;
    private List<TelemetryWatchlistTagDto> tags;
}
