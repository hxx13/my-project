package com.example.demo.modules.accessrule.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class AccessRuleItemPayload {
    private Long id;
    private String roomId;
    private List<String> channelCodes = new ArrayList<>();
    private List<Long> doorGroupIds = new ArrayList<>();
    private List<String> aroUserIds = new ArrayList<>();
    private Integer sortOrder;
}
