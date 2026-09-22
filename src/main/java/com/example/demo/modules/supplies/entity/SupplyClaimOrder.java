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
    /** 领用楼层：领用单表头那一栏，出库处理时管理员手填（系统原本没有这个字段）。 */
    private String claimFloor;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
}
