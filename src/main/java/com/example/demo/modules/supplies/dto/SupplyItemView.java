package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyItemView {
    private Long id;
    private Long categoryId;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private Integer stockQty;
    /** 待处理领用单锁定数量 */
    private Integer lockedQty;
    /** 可用库存：QUANTIFIED = max(0, stockQty - lockedQty)；FLAG = stockQty */
    private Integer availableQty;
    private Integer deleted;
    private java.time.LocalDateTime deletedTime;
    private String deletedBy;
    private java.time.LocalDateTime purgeAfterTime;
    private java.time.LocalDateTime createdAt;
    private java.time.LocalDateTime lastInboundAt;
    private String specSchema;
    private Integer specRequired;
    private Integer independentOrder;
    private Boolean isNewItem;
    private Boolean isNewInbound;
    private String noveltyTag;
}
