package com.example.demo.modules.supplies.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SupplyCategory {
    private Long id;
    private String name;
    private Integer sortOrder;
    private Integer status;
    private LocalDateTime updatedAt;
}
