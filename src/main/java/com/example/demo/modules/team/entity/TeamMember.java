package com.example.demo.modules.team.entity;

import lombok.Data;

/**
 * 团队成员表。
 */
@Data
public class TeamMember {
    private Long id;
    private Long teamId;
    private Long personnelId;
    private String roleCode;        // OWNER / MANAGER / MEMBER
    private String joinedAt;
    private Integer deleted;
    private String createdAt;
    private String updatedAt;
}
