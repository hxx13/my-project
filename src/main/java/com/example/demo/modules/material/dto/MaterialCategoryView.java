package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialCategoryView {
    private Long id;
    private String name;
    private Integer sortOrder;
    private Integer status;
}
