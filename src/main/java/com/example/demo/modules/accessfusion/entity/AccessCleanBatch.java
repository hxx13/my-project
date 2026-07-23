package com.example.demo.modules.accessfusion.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessCleanBatch {
    private Long id;
    private String batchType;
    private LocalDateTime windowStart;
    private LocalDateTime windowEnd;
    private String status;
    private Integer rawIn;
    private Integer cleanedOut;
    private Integer visitOut;
    private Integer reviewCount;
    private String errorMessage;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
}
