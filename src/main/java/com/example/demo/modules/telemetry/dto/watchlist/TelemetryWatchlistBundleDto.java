package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetryWatchlistBundleDto {
    private Long id;
    private String code;
    private String displayName;
    private String sourceFilename;
    private boolean active;
    /** 本分区是否参与 WinCC 合并拉数（大量变量时可关） */
    private boolean includeInWinccPoll;
}
