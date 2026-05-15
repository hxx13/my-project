package com.example.demo.modules.asset.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AssetColumnDef {
    private Long id;
    private String columnKey;
    private String columnLabel;
    private String valueType;
    private Integer sortable;
    private Integer searchable;
    private Integer sortOrder;
    private String createBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

