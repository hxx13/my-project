package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialStockMovement {
    private Long id;
    private Long itemId;
    private String movementType;
    private Integer qty;
    private Integer stockAfter;
    private String requestId;
    private Long requestLineId;
    private String operatorUserId;
    private String applicantUserId;
    private String remark;
    private LocalDateTime createdAt;
}
