package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class NotifyRule {
    private Long id;
    private String eventType;
    private String bizType;
    private Integer enabled;
    private String recipientMode;
    private Integer minRoleLevel;
    private String templateKey;
    private LocalDateTime updateTime;
}
