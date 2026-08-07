package com.example.demo.modules.referencedata.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RefDataView {
    private Long id;
    private String refType;
    private Long parentId;
    private Integer sortOrder;
    private Integer status;
    private Object fieldData;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Integer childCount;
}
