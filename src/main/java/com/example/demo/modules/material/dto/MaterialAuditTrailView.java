package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialAuditTrailView {
    private String requestId;
    private String userId;
    private String applicantName;
    private String applicantGroup;
    private String status;
    private String itemName;
    private Integer qty;
    private Integer fulfilledQty;
    private String createdAt;
    private String fulfilledAt;
    private String fulfilledBy;
    private String firstReviewerId;
    private String secondReviewerId;
    private String firstReviewTime;
    private String secondReviewTime;
}
