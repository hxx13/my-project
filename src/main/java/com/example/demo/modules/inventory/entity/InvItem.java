package com.example.demo.modules.inventory.entity;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class InvItem {
    private Long id;
    private String rfidCode;
    private String name;
    private Long categoryId;
    private Long spaceId;
    /** UNIT=一物一码 / BATCH=一批一码 */
    private String granularity;
    /** BATCH 用数量，UNIT 恒为 1 */
    private Integer qty;
    /** IN_USE=在库 / MISSING=丢失待确认 / RETIRED=已废弃 */
    private String status;
    private String iconType;
    private String iconValue;
    /** 封面图URL（标签卡片缩略图） */
    private String coverUrl;
    /** 详情图URL数组（JSON 字符串） */
    private String detailImages;
    private String brand;
    private String model;
    private String spec;
    private LocalDateTime expireAt;
    private String supplier;
    private String purchaseNo;
    private BigDecimal price;
    private LocalDate purchaseDate;
    private LocalDate warrantyUntil;
    private String fundSource;
    private String ext;
    private LocalDateTime lastScannedAt;
    private String createdBy;
    private Integer deleted;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
