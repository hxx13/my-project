package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormSubmission {
    private Long id;
    private Long formId;
    private Long userId;
    private String status;
    private String fieldValuesJson;
    private Integer version;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
