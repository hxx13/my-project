package com.example.demo.modules.twin.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class DahuaIssueCardResponse {
    private boolean success;
    private String failStep;
    private Long personId;
    private String personCode;
    private List<DahuaIssueStepResult> steps = new ArrayList<>();
}
