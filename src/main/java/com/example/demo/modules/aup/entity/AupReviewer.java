package com.example.demo.modules.aup.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * AUP 审查人名册（IACUC 秘书/专家，替代缺失的 RoleEnum 角色）。
 * 唯一约束：UNIQUE(user_id, reviewer_role)。
 */
@Data
public class AupReviewer {
    private Long id;
    private String userId;
    /** secretary/expert */
    private String reviewerRole;
    /** 可审范围（全校/某课题组），NULL=全校 */
    private String scope;
    private Integer enabled;
    private LocalDateTime createdAt;
}
