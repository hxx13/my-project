package com.example.demo.modules.supplies.dto;

import lombok.Data;

/**
 * 按物品从领用单明细还原的历史出库行（无库存流水时的部分恢复）。
 */
@Data
public class SupplyAuditRestoredRow {
    private String outboundTime;
    private String claimId;
    private String itemName;
    private Integer applyQty;
    private Integer outboundQty;
    private String applicantUserId;
    private String fulfilledByUserId;
    /** 以下为列表展示用，不入库 */
    private String applicantName;
    private String fulfilledByName;
}
