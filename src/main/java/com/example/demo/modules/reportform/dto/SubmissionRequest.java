package com.example.demo.modules.reportform.dto;

import lombok.Data;

@Data
public class SubmissionRequest {
    private String fieldValuesJson;
    private Integer expectedVersion;
}
