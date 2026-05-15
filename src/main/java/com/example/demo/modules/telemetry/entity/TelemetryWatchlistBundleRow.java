package com.example.demo.modules.telemetry.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TelemetryWatchlistBundleRow {
    private Long id;
    private String code;
    private String displayName;
    private String sourceFilename;
    private Integer isActive;
    /** 1=本分区变量参与 WinCC 合并拉数 */
    private Integer includeInWinccPoll;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
