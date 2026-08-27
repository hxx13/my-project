package com.example.demo.modules.team.entity;

import lombok.Data;

/**
 * 团队审计日志，只增不删。
 */
@Data
public class TeamAuditLog {
    private Long id;
    private Long teamId;
    private Long actorPersonnelId;
    private String action;
    private String targetType;
    private Long targetId;
    private String detail;
    private String createdAt;
}
