package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessAuditSourceConfig {
    private Long id;
    private String name;
    private Integer enabled;
    private Long swingTaskId;
    private String channelCode;
    private String personCode;
    private String personName;
    private Integer openType;
    private Integer requireMapping;
    private Integer openSuccessOnly;
    private Integer autoSyncEnabled;
    private LocalDateTime lastSyncAt;
    private Integer lastSyncCount;
    private Integer lastPreviewSwingCount;
    private Integer lastPreviewRawCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
