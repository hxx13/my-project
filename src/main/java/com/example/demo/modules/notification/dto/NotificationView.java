package com.example.demo.modules.notification.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class NotificationView {
    private String id;
    private String eventType;
    private String title;
    private String content;
    private String senderId;
    private String bizType;
    private String bizId;
    private Integer isRead;
    private LocalDateTime readTime;
    private LocalDateTime createTime;
}
