package com.example.demo.modules.material.dto;

import lombok.Data;

@Data
public class MaterialItemView {
    private Long id;
    private Long categoryId;
    private String categoryName;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private Integer stockQty;
    private Integer lockedQty;
    private Integer showStockQty;
    private String workflowType;
    private String reviewerIds;
    private String secondReviewerIds;
    private Boolean isNewItem;
    private String createdAt;
    private String lastInboundAt;
    private String specSchema;
    private Integer specRequired;
    private Integer independentOrder;
    /** 预约提前通知小时数 */
    private Integer notifyAdvanceHours;
}
