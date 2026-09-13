package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 区域归属：region_type + region_id + user_id + grant_role 唯一。user_id = personnel.id。 */
@Data
public class CageRegionGrant {

    public static final String ROLE_SCOPE = "SCOPE";
    public static final String ROLE_LEADER = "LEADER";
    public static final String ROLE_MEMBER = "MEMBER";
    public static final String ROLE_REVIEWER = "REVIEWER";

    private Long id;
    private String regionType;    // CAMPUS | FLOOR | ROOM
    private String regionId;
    private String userId;        // personnel.id
    private String grantRole;     // SCOPE | LEADER | MEMBER | REVIEWER
    private String leaderUserId;  // 仅 MEMBER 行有值
    private String grantedBy;
    private LocalDateTime createdAt;
}
