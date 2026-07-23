package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class NotificationRecipient {
    private Long id;
    private String notificationId;
    private String recipientUserId;
    private Integer isRead;
    private LocalDateTime readTime;
    private LocalDateTime createTime;
}
