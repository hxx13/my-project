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
    /** 发送人展示名（列表/详情时 UDNS 解析；title/content 为发布时正文快照，不回写） */
    private String senderName;
    private String bizType;
    private String bizId;
    private Integer isRead;
    private LocalDateTime readTime;
    private LocalDateTime createTime;
}
