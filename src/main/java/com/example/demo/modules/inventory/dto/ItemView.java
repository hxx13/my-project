package com.example.demo.modules.inventory.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 物品视图：与 {@link com.example.demo.modules.inventory.entity.InvItem} 同字段，
 * 额外附加 spacePath（空间完整路径）与 categoryName（分类名）。
 */
@Data
public class ItemView {
    private Long id;
    private String rfidCode;
    private String name;
    private Long categoryId;
    private Long spaceId;
    /** UNIT=一物一码 / BATCH=一批一码 */
    private String granularity;
    private Integer qty;
    /** IN_USE=在库 / MISSING=丢失待确认 / RETIRED=已废弃 */
    private String status;
    private String iconType;
    private String iconValue;
    private String coverUrl;
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

    /** 空间完整路径，如「1号楼 / 3F手术区 / 手术室101」 */
    private String spacePath;
    /** 分类名 */
    private String categoryName;
}
