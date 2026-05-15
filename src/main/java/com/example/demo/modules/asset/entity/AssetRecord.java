package com.example.demo.modules.asset.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AssetRecord {
    private String id;
    private String assetCode;
    private String assetName;
    private String status;
    private String location;
    private Integer locked;
    private String note;
    private String createBy;
    private String updateBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String latestTransferRequestId;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
}

