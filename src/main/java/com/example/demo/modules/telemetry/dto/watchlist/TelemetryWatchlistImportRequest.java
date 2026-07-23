package com.example.demo.modules.telemetry.dto.watchlist;

import lombok.Data;

@Data
public class TelemetryWatchlistImportRequest {
    /** UTF-8 全文，WinCC 导出风格（首列点名，次列可选注释作展示名） */
    private String csvText;
    private String sourceFilename;
}
