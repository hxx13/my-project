package com.example.demo.modules.inventory.dto;

import lombok.Data;

@Data
public class CategoryUpsertReq {
    private Long parentId;
    private String name;
    private String iconType;
    private String iconValue;
    private Integer sortOrder;
}
