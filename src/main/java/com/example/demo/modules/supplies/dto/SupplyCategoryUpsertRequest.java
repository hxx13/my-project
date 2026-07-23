package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyCategoryUpsertRequest {
    private String name;
    private Integer sortOrder;
    private Integer status;
}
