package com.example.demo.modules.telemetry.dto.archive;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TelemetryArchivePurgeConfigDto {
    private boolean purgeEnabled;
    private int retentionDays;
    private int batchDeleteSize;
    private boolean optimizeAfterPurge;
    private boolean archiveWriteEnabled;
    private String lastPurgeAt;
    private Long lastPurgeDeletedRows;
    private Integer lastPurgeDurationMs;
    /** 定时清理 Job 键，在「定时任务管理」配置执行时刻 */
    private String scheduleJobKey;
    private String scheduleJobName;
}
