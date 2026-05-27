package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TelemetryArchivePurgeProgressDto {
    /** 是否正在清理 */
    private boolean inProgress;
    /** IDLE | RUNNING | COMPLETED | FAILED */
    private String status;
    /** 本次任务已累计删除行数 */
    private long deletedThisSession;
    /** 已执行批次数 */
    private int batchRounds;
    /** 表内剩余行数（约） */
    private long remainingRowsApprox;
    /** 开始时估算待删行数（用于进度条） */
    private long initialTargetRows;
    /** 0～100，估算进度 */
    private int percentComplete;
    /** 本次开始时间 ISO */
    private String startedAt;
    /** 最近更新时间 ISO */
    private String lastUpdatedAt;
    private String message;
    private String error;
}
