package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** NHP entity mapped to `crf_pathology`. */
@Data
public class CrfPathology {
    private Long id;
    private String pathCode;
    private Long txId;
    private Long sampleId;
    private String samplingType;
    private String organCode;
    private String timepointCode;
    private String heFindings;
    private String rejGrade;
    private String microThrombosis;
    private String emResult;
    private String pathDx;
    private LocalDate reportDate;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
