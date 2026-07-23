package com.example.demo.modules.accessrule.entity;

import lombok.Data;

@Data
public class AccessRuleItem {
    private Long id;
    private Long ruleId;
    private String roomId;
    private String channelCodesJson;
    private String doorGroupIdsJson;
    private Integer sortOrder;
}
