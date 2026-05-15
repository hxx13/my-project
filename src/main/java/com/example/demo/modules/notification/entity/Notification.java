package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Notification {
    private String id;
    private String eventType;
    private String title;
    private String content;
    private String senderId;
    private String bizType;
    private String bizId;
    private LocalDateTime createTime;
}
