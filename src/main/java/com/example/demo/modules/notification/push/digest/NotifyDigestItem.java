package com.example.demo.modules.notification.push.digest;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class NotifyDigestItem {
    private Long id;
    private String userId;
    private String sourceCode;
    private String channelCode;
    private String title;
    private String content;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime sendTime;
}
