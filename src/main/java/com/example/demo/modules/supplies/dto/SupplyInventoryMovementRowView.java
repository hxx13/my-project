package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyInventoryMovementRowView {
    private Long id;
    private Long itemId;
    private String itemName;
    private Long itemCategoryId;
    private String categoryName;
    private String movementType;
    private Integer qty;
    private Integer stockAfter;
    private String claimId;
    private Long claimLineId;
    private String operatorUserId;
    private String operatorName;
    private String applicantUserId;
    private String applicantName;
    private String remark;
    private String createdAt;
}
