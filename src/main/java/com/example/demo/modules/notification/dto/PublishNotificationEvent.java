package com.example.demo.modules.notification.dto;

import lombok.Data;

import java.util.Map;
import java.util.Set;

@Data
public class PublishNotificationEvent {
    private String eventType;
    private String bizType;
    private String bizId;
    private String senderId;
    private String applicantId;
    private String processorId;
    private Set<String> relatedUserIds;
    private Map<String, String> variables;
}
