package com.example.demo.modules.cageshelf.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** 笼位申请审核人归属：reviewer_user_id + scope_type + scope_id 唯一。 */
@Data
public class CageAuditAssignment {
    private Long id;
    private String reviewerUserId;   // 审核人 sys_user.id
    private String scopeType;        // FLOOR | ROOM | CAMPUS
    private String scopeId;          // cage_shelf_index 的 floor_id / room_id / campus_id 字符串化
    private LocalDateTime createdAt;
}
