package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP entity mapped to `crf_adverse_event`. */
@Data
public class CrfAdverseEvent {
    private Long id;
    private String aeCode;
    private Long txId;
    private String aeType;
    private String aeGrade;
    private Long rejectionRef;
    private Long biopsySampleId;
    private String intervention;
    private String aeOutcome;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
