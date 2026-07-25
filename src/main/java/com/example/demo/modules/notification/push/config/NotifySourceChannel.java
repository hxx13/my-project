package com.example.demo.modules.notification.push.config;

import lombok.Data;
import java.time.LocalTime;

@Data
public class NotifySourceChannel {
    private Long id;
    private Long sourceId;
    private String channelCode;
    private Integer enabled;
    private String titleTpl;
    private String contentTpl;
    private LocalTime quietStart;
    private LocalTime quietEnd;
    private Integer rateLimitSeconds;
}
