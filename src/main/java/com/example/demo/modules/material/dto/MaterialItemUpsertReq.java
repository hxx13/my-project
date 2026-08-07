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
    private Integer stockQty;
    private Integer showStockQty;
    private String specSchema;
    private Integer specRequired;
    private Integer independentOrder;
    /** 预约提前通知小时数：0=立即通知，>0=预约提前N小时 */
    private Integer notifyAdvanceHours;
}
