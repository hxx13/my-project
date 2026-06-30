package com.example.demo.modules.reportform.dto;

import lombok.Data;

@Data
public class SubmissionRequest {
    private Long submissionId;
    private String fieldValuesJson;
    private Integer expectedVersion;
}
