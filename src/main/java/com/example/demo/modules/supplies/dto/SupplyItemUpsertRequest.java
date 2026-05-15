package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyItemUpsertRequest {
    private Long categoryId;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private Integer stockQty;
}
