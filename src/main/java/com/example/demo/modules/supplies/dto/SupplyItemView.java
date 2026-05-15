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
    private Integer deleted;
    private java.time.LocalDateTime deletedTime;
    private String deletedBy;
    private java.time.LocalDateTime purgeAfterTime;
    private java.time.LocalDateTime createdAt;
    private java.time.LocalDateTime lastInboundAt;
    private Boolean isNewItem;
    private Boolean isNewInbound;
    private String noveltyTag;
}
