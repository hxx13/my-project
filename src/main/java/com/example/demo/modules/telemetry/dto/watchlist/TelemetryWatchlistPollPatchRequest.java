package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.Data;

@Data
public class TelemetryWatchlistPollPatchRequest {
    /** true=本分区参与 WinCC 合并轮询拉数 */
    private Boolean includeInWinccPoll;
}
