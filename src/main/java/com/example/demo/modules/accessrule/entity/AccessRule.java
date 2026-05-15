package com.example.demo.modules.accessrule.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AccessRule {
    private Long id;
    private String ruleCode;
    private String name;
    private Integer enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
