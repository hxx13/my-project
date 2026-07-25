package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class NotifyDeliveryLog {
    private Long id;
    private String notificationId;
    private String recipientUserId;
    private String channel;
    private String templateKey;
    private String status;
    private String providerMsgId;
    private String errorCode;
    private String errorMsg;
    private Integer retryCount;
    private LocalDateTime nextRetryTime;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    // 外部推送扩展字段
    private String sourceCode;
    private String sourceName;
    private String channelName;
    private String recipientName;
    private String title;
    private String content;
    private Integer maxRetries;
}
