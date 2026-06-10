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
}
