package com.example.demo.modules.notification.dto;

import lombok.Data;

@Data
public class UpdateNotifyRuleRequest {
    private Integer enabled;
    private String recipientMode;
    private Integer minRoleLevel;
    private String templateKey;
}
