package com.example.demo.modules.policy.dto;

import lombok.Data;

@Data
public class CapabilitySummaryRow {
    private String bizDomain;
    private boolean canSubmit;
    private boolean canProcess;
    private boolean canViewAllPending;
    private boolean applicantOnlyMineMode;
}
