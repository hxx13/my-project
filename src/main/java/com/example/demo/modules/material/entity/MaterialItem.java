package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialItem {
    private Long id;
    private Long categoryId;
    private String name;
    private String subtitle;
    private String coverUrl;
    private String shelfStatus;
    private String stockMode;
    private Integer stockQty;
    /** 已锁定（申领中预占）数量 */
    private Integer lockedQty;
    /** 学生视角是否显示具体库存数量：1=显示数字，0=显示"有货" */
    private Integer showStockQty;
    /** SIMPLE or DUAL_REVIEW — 物品级别可选审核流程 */
    private String workflowType;
    /** 初审人账号 ID JSON 数组 */
    private String reviewerIds;
    /** 复审人账号 ID JSON 数组（仅 DUAL_REVIEW 时使用） */
    private String secondReviewerIds;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastInboundAt;
    /** 规格定义 JSON，如 {"dimensions":[{"name":"尺码","options":["S","M","L"]}]} */
    private String specSchema;
    /** 是否强制选规格：0=可选 1=必选 */
    private Integer specRequired;
}
