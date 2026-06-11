package com.example.demo.modules.material.dto;

import lombok.Data;

/** 库存流水视图 — 用于按物品审计表格 */
@Data
public class MaterialStockMovementView {
    private Long id;
    private Long itemId;
    private String itemName;
    private String movementType;
    private Integer qty;
    private Integer stockAfter;
    private String requestId;
    private String operatorUserId;
    private String applicantUserId;
    private String remark;
    private String createdAt;
}
