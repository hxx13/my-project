package com.example.demo.modules.asset.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AssetImportBatch {
    private String id;
    private String fileName;
    private String importedBy;
    private LocalDateTime importedAt;
    private int createdCount;
    private int updatedCount;
    private int skippedCount;
    private String errorDetail;
    private LocalDateTime createTime;
}
