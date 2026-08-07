package com.example.demo.modules.referencedata.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefData {
    private Long id;
    private String refType;
    private Long parentId;
    private Integer sortOrder;
    private Integer status;
    private String fieldData;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
