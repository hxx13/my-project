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
    /** 独立下单拆分：本次提交共生成的工单数（含本单）；未拆分为 null */
    private Integer splitCount;
    /** 独立下单拆分：其余拆分出的工单号 */
    private java.util.List<String> splitOrderIds;
}
