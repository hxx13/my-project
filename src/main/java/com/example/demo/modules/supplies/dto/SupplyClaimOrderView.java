package com.example.demo.modules.supplies.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class SupplyClaimOrderView {
    private String id;
    private String userId;
    private String applicantName;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime fulfilledAt;
    private String fulfilledBy;
    /** 出库操作人展示名（用户名，无则 id） */
    private String fulfilledByName;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private List<SupplyClaimLineView> lines;
}
