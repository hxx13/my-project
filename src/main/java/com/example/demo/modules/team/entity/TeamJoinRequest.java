package com.example.demo.modules.team.entity;

import lombok.Data;

/**
 * 团队加入申请 / 邀请表。
 */
@Data
public class TeamJoinRequest {
    private Long id;
    private Long teamId;
    private Long personnelId;
    private String type;            // INVITE / APPLY
    private String status;          // PENDING / APPROVED / REJECTED / CANCELLED
    private String message;
    private Long reviewerPersonnelId;
    private String reviewedAt;
    private Integer deleted;
    private String createdAt;
    private String updatedAt;
}
