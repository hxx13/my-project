package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyCategoryUpsertRequest {
    private String name;
    private String coverUrl;
    private Integer sortOrder;
    private Integer status;
}
