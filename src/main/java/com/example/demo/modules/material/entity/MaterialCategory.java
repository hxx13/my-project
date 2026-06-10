package com.example.demo.modules.material.entity;

import lombok.Data;

@Data
public class MaterialCategory {
    private Long id;
    private String name;
    private Integer sortOrder;
    private Integer status;
    private java.time.LocalDateTime createdAt;
    private java.time.LocalDateTime updatedAt;
}
