package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TelemetryArchivePurgeResultDto {
    private long deletedRows;
    private int durationMs;
    private boolean optimized;
    private String cutoffBefore;
    private long remainingRows;
    /** 本次 HTTP 是否因批次数上限提前结束（需再次点击「立即清理」） */
    private boolean partial;
    private String message;
}
