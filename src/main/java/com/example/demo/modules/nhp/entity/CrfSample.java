package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_sample`. */
@Data
public class CrfSample {
    private Long id;
    private String sampleCode;
    private Long txId;
    private Long donorSubjectId;
    private Long recipientSubjectId;
    private String sampleType;
    private String timepointCode;
    private LocalDateTime collectDatetime;
    private String storageCondition;
    private String storageLocation;
    private String status;
    private Boolean active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
