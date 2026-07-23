package com.example.demo.modules.policy.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class BizCapabilityPolicy {
    private Long id;
    private String bizDomain;
    /** RoleEnum.level */
    private Integer minRoleSubmit;
    private Integer minRoleProcess;
    private Integer minRoleViewAllPending;
    /** VISIBLE_POOL | ONLY_MINE */
    private String applicantListMode;
    private Integer visibilityPublicAllowed;
    private String extensionJson;
    private Integer enabled;
    private Integer sortOrder;
    private Long policyVersion;
    private LocalDateTime updatedAt;
}
