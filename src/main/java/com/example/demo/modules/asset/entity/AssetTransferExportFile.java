package com.example.demo.modules.asset.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AssetTransferExportFile {
    private String id;
    private String requestId;
    private String fileName;
    private String storageKey;
    private String downloadToken;
    private String status;
    private LocalDateTime expireAt;
    private String summaryText;
    private String createdBy;
    private LocalDateTime createdTime;
}

