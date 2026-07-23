package com.example.demo.modules.material.dto;

import lombok.Data;
import java.util.List;

@Data
public class MaterialRequestView {
    private String id;
    private String userId;
    private String applicantName;
    private String applicantGroup;
    private String status;
    private String workflowType;
    private String firstReviewerId;
    private String firstReviewTime;
    private String secondReviewerId;
    private String secondReviewTime;
    private String fulfilledAt;
    private String fulfilledBy;
    private String receivedAt;
    private String createdAt;
    private String updatedAt;
    private List<MaterialRequestLineView> lines;
}
