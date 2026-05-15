package com.example.demo.modules.notification.dto;

import lombok.Data;

import java.util.List;

@Data
public class SettingDefinitionView {
    private Long id;
    private String module;
    private String configKey;
    private String labelZh;
    private String description;
    private String valueType;
    private List<String> options;
    private String defaultValue;
    private Integer isSensitive;
    private Integer requiresRestart;
    private Integer isPublic;
}
