package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SystemConfigItem {
    private Long id;
    private String module;
    private String configKey;
    private String configValue;
    private String valueType;
    private String remark;
    private LocalDateTime updateTime;
}
