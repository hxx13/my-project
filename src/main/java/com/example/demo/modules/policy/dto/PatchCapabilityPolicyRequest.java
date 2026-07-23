package com.example.demo.modules.policy.dto;

import lombok.Data;

@Data
public class PatchCapabilityPolicyRequest {
    private Integer minRoleSubmit;
    private Integer minRoleProcess;
    private Integer minRoleViewAllPending;
    private String applicantListMode;
    private Integer visibilityPublicAllowed;
    private String extensionJson;
    private Integer enabled;
    private Integer sortOrder;
}
