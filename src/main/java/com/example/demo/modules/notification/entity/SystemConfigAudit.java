package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SystemConfigAudit {
    private Long id;
    private Long configId;
    private String module;
    private String configKey;
    private String oldValue;
    private String newValue;
    private String operatorId;
    private LocalDateTime createTime;
}
