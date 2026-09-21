package com.example.demo.modules.personnel.entity;

import lombok.Data;

/**
 * 课题组加入申请（子系统4）。
 * 状态机抄 team_join_request：PENDING / APPROVED / REJECTED / CANCELLED。
 */
@Data
public class ProjectGroupJoinRequest {
    private Long id;
    private Long projectGroupId;
    private Long personnelId;
    private String status;              // PENDING / APPROVED / REJECTED / CANCELLED
    private String message;
    private Long reviewerPersonnelId;
    private String reviewedAt;
    private String rejectReason;
    private String createdAt;
}
