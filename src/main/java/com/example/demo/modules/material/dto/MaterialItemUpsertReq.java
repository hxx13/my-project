package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialItemUpsertReq {
    private Long categoryId;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private String workflowType;
    private String reviewerIds;
    private String secondReviewerIds;
}
