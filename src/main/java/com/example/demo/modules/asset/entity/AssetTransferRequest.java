package com.example.demo.modules.asset.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AssetTransferRequest {
    private String id;
    private String assetId;
    private String assetCode;
    private String assetName;
    private String applicantId;
    private String applicantName;
    private LocalDateTime transferTime;
    private String transferLocation;
    /** Snapshot of asset.location at submit time (for admin delete rollback). */
    private String fromLocation;
    private String remark;
    private String photoUrl;
    /** JSON array of URLs, transfer before */
    private String photoUrlsBefore;
    /** JSON array of URLs, transfer after */
    private String photoUrlsAfter;
    private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}

