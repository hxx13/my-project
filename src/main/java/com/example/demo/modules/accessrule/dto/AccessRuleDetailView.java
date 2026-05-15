package com.example.demo.modules.accessrule.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class AccessRuleDetailView {
    private Long id;
    private String ruleCode;
    private String name;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<AccessRuleItemPayload> items = new ArrayList<>();
}
