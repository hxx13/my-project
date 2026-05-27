package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessSwingCleanRun {
    private Long id;
    private String channelCode;
    private Long packageId;
    private String triggerType;
    private String statsTaskIdsJson;
    private String configSnapshotJson;
    private LocalDateTime incrementalAfterTime;
    private LocalDateTime windowStart;
    private LocalDateTime windowEnd;
    private String status;
    private Integer totalScanned;
    private Integer includedCount;
    private Integer excludedCount;
    private Integer reviewCount;
    private Long supersededByRunId;
    private String errorMessage;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
}
