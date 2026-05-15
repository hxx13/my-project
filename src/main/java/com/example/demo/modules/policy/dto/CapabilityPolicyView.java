package com.example.demo.modules.policy.dto;

import lombok.Data;

@Data
public class CapabilityPolicyView {
    private String bizDomain;
    private int minRoleSubmit;
    private int minRoleProcess;
    private int minRoleViewAllPending;
    private String applicantListMode;
    private int visibilityPublicAllowed;
    private String extensionJson;
    private int enabled;
    private int sortOrder;
    private long policyVersion;
}
