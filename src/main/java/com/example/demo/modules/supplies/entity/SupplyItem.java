package com.example.demo.modules.supplies.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SupplyItem {
    private Long id;
    private Long categoryId;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private Integer stockQty;
    /** 待处理领用单锁定数量（提交时预占，出库/撤回/删除时释放） */
    private Integer lockedQty;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastInboundAt;
    private String specSchema;
    private Integer specRequired;
    /** 是否独立成单：1=必须单独成单，不与其他物品混合领用；0=可合并 */
    private Integer independentOrder;
}
