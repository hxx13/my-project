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
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastInboundAt;
}
