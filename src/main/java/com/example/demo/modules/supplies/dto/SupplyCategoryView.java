package com.example.demo.modules.supplies.dto;

import lombok.Data;

@Data
public class SupplyCategoryView {
    private Long id;
    private String name;
    private String coverUrl;
    private Integer sortOrder;
    private Integer status;
}
