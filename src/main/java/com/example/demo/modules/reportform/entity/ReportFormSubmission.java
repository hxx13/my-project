package com.example.demo.modules.reportform.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
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
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss+08:00")
    private LocalDateTime submittedAt;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss+08:00")
    private LocalDateTime createdAt;
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss+08:00")
    private LocalDateTime updatedAt;
}
