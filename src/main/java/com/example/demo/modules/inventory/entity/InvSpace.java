package com.example.demo.modules.inventory.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class InvSpace {
    private Long id;
    private Long parentId;
    private String name;
    private String type;
    private String icon;
    private Double posX;
    private Double posY;
    private Double width;
    private Double height;
    private Integer sortOrder;
    private String code;
    private Integer deleted;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
