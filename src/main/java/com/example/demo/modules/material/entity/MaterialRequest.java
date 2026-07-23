package com.example.demo.modules.material.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class MaterialRequest {
    private String id;
    private String userId;
    private String applicantName;
    /** 申请人所属课题组（冗余，便于统计） */
    private String applicantGroup;
    /** DRAFT / PENDING / FIRST_OK / APPROVED / REJECTED / FULFILLED / RECEIVED */
    private String status;
    /** 快照物品的 workflow_type */
    private String workflowType;
    private String firstReviewerId;
    private LocalDateTime firstReviewTime;
    private String secondReviewerId;
    private LocalDateTime secondReviewTime;
    private LocalDateTime fulfilledAt;
    private String fulfilledBy;
    private LocalDateTime receivedAt;
    private Integer deleted;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
