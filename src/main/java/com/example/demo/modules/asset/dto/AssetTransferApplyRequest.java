package com.example.demo.modules.asset.dto;

import lombok.Data;

import java.util.List;

@Data
public class AssetTransferApplyRequest {
    private String assetId;
    private String transferTime;
    private String transferLocation;
    private String remark;
    private String photoUrl;
    private List<String> photoUrlsBefore;
    private List<String> photoUrlsAfter;
}

