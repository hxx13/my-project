package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessCleanPackage {
    private Long id;
    private Long statsTaskId;
    private String channelCode;
    private String packageName;
    private LocalDateTime windowStart;
    private LocalDateTime windowEnd;
    private String status;
    private Integer totalScanned;
    private Integer includedCount;
    private Integer excludedCount;
    private Integer reviewCount;
    private LocalDateTime publishedAt;
    private LocalDateTime lastMergedSwingTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
