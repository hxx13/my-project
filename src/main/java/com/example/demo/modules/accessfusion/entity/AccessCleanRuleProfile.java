package com.example.demo.modules.accessfusion.entity;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AccessCleanRuleProfile {
    private Long id;
    private String name;
    private String description;
    private Integer debounceSeconds;
    private String swingDirectionFilter;
    private Integer autoCleanPackage;
    private Integer requireMapping;
    private Integer openSuccessOnly;
    private String defaultDoorMode;
    private String createdAt;
    private String updatedAt;
}
