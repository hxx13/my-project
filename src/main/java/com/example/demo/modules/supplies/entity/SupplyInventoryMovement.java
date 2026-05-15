package com.example.demo.modules.supplies.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SupplyInventoryMovement {
    private Long id;
    private Long itemId;
    private String movementType;
    private Integer qty;
    private Integer stockAfter;
    private String claimId;
    private Long claimLineId;
    private String operatorUserId;
    private String applicantUserId;
    private String remark;
    private LocalDateTime createdAt;
}
