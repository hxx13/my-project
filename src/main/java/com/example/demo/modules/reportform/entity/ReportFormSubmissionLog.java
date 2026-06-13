package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormSubmissionLog {
    private Long id;
    private Long submissionId;
    private Long userId;
    private String action;               // save | submit
    private String fieldValuesSnapshotJson;
    private LocalDateTime createdAt;
}
