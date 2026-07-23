package com.example.demo.modules.accessrule.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class AccessRuleSaveRequest {
    private String name;
    private Boolean enabled;
    private List<AccessRuleItemPayload> items = new ArrayList<>();
}
