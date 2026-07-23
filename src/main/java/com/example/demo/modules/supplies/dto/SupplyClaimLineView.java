package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyClaimLineView {
    private Long id;
    private Long itemId;
    private Integer qty;
    private String snapshotName;
    private Integer fulfilledQty;
    private String coverUrl;
    private String remark;
    private String specSnapshot;
    /** 物品是否独立成单（1=是）；物品已删除时为 null，前端据此对工单分类 */
    private Integer independentOrder;
}
