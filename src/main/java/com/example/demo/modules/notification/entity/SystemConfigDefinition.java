package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SystemConfigDefinition {
    private Long id;
    private String module;
    private String configKey;
    private String labelZh;
    private String description;
    private String valueType;
    private String optionsJson;
    private String defaultValue;
    private Integer isSensitive;
    private Integer requiresRestart;
    private Integer isPublic;
    private LocalDateTime updateTime;
}
