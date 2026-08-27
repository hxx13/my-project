package com.example.demo.modules.team.entity;

import lombok.Data;

/**
 * 团队表。
 */
@Data
public class Team {
    private Long id;
    private String name;
    private String description;
    private String avatar;
    private String visibility;      // PUBLIC / PRIVATE
    private String status;          // ACTIVE / DISSOLVED
    private Long ownerPersonnelId;
    private Integer maxMembers;
    private String createdBy;
    private Integer deleted;
    private String createdAt;
    private String updatedAt;
}
