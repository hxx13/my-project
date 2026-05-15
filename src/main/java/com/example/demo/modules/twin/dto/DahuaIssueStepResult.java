package com.example.demo.modules.twin.dto;

import lombok.Data;

@Data
public class DahuaIssueStepResult {
    private String stepName;
    private boolean success;
    private String upstreamCode;
    private String upstreamErrMsg;
    private String message;
    private String rawSnippet;
}
