package com.example.demo.modules.inventory.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class InvCategory {
    private Long id;
    private Long parentId;
    private String name;
    private String iconType;
    private String iconValue;
    private Integer sortOrder;
    private Integer deleted;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
