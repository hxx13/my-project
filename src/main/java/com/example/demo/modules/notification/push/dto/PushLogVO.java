package com.example.demo.modules.notification.push.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class PushLogVO {
    private Long id;
    private String notificationId;
    private String sourceCode;
    private String sourceName;
    private String channelCode;
    private String channelName;
    private String recipientUserId;
    private String recipientName;
    private String target;
    private String title;
    private String content;
    private String status;
    private String providerMsgId;
    private String errorCode;
    private String errorMsg;
    private Integer retryCount;
    private Integer maxRetries;
    private LocalDateTime createTime;
}
