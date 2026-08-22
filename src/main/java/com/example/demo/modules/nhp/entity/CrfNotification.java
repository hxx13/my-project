package com.example.demo.modules.nhp.entity;

import lombok.Data;

import java.time.LocalDateTime;

/** NHP 通知消息（V39，未读角标持久化）。 */
@Data
public class CrfNotification {
    private Long id;
    /** 接收人；空=广播 */
    private String userId;
    /** REVIEW / QUALITY / TODO / VERSION */
    private String type;
    private String refType;
    private Long refId;
    private String title;
    /** 0 未读 / 1 已读 */
    private Boolean read;
    private LocalDateTime createdAt;
}
