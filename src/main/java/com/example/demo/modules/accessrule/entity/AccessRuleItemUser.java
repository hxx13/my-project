package com.example.demo.modules.accessrule.entity;

import lombok.Data;

@Data
public class AccessRuleItemUser {
    private Long id;
    private Long itemId;
    private String roomId;
    private String aroUserId;
}
