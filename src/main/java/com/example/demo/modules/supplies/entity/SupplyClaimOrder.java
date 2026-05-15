package com.example.demo.modules.supplies.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SupplyClaimOrder {
    private String id;
    private String userId;
    private String applicantName;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime fulfilledAt;
    private String fulfilledBy;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
}
