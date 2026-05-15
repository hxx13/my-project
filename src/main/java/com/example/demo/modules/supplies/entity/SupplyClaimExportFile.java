package com.example.demo.modules.supplies.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SupplyClaimExportFile {
    private String id;
    private String claimId;
    private String fileName;
    private String storageKey;
    private String status;
    private String summaryText;
    private String downloadToken;
    private LocalDateTime expireAt;
    private String createdBy;
    private LocalDateTime createdTime;
}

