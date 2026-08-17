package com.example.demo.modules.inventory.dto;

import lombok.Data;

import java.util.List;

@Data
public class CategoryNodeView {
    private Long id;
    private Long parentId;
    private String name;
    private String iconType;
    private String iconValue;
    private Integer sortOrder;
    private List<CategoryNodeView> children;
}
