package com.example.demo.modules.asset.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AssetRecordValue {
    private Long id;
    private String assetId;
    private String columnKey;
    private String columnValue;
    private LocalDateTime updateTime;
}

