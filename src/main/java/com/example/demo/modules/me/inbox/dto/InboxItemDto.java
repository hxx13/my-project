package com.example.demo.modules.me.inbox.dto;

import lombok.Data;

import java.util.HashMap;
import java.util.Map;

@Data
public class InboxItemDto {
    /** NOTIFICATION | REPAIR | PURCHASE | SUPPLIES_CLAIM */
    private String kind;
    private String id;
    private String title;
    private String subtitle;
    /** 用于合并排序与分页游标 */
    private long sortAtMillis;
    private Boolean unread;
    private Map<String, Object> payload = new HashMap<>();
}
