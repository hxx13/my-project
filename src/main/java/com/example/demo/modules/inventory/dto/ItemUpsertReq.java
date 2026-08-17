package com.example.demo.modules.inventory.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 物品创建/更新请求体。
 */
@Data
public class ItemUpsertReq {
    private String rfidCode;
    private String name;
    private Long categoryId;
    private Long spaceId;
    private String granularity;
    private Integer qty;
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
}
