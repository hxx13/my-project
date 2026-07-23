package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyCategoryView {
    private Long id;
    private String name;
    private Integer sortOrder;
    private Integer status;
}
