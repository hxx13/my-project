package com.example.demo.modules.telemetry.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 顺序诊断：先读内置默认点名，再读当前 watchlist，用于区分「点名/权限」与「网络/WinCC 整体慢」。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TelemetrySequentialDiagnosticDto {

    private boolean winccEnabled;

    /** winccEnabled=false 时的说明 */
    private String disabledReason;

    private StepResult stepBuiltInDefaults;

    private StepResult stepWatchlist;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StepResult {

        private String label;

        private int variableCount;

        /** 最多前 2 条点名，便于对照日志 */
        private List<String> variablePreview;

        private boolean success;

        private long durationMs;

        /** 成功时 WinCC 返回行数 */
        private Integer responseRowCount;

        private String errorMessage;
    }
}
