package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.Data;

@Data
public class TelemetryWatchlistCreateRequest {
    private String code;
    private String displayName;
}
