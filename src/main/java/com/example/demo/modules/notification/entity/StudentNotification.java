package com.example.demo.modules.notification.entity;

import lombok.Data;
import java.time.LocalDateTime;

/** 学生端独立通知实体 —— 与教职工 sys_notification 物理隔离 */
@Data
public class StudentNotification {
    private String id;
    private String title;
    private String summary;
    /** PLATFORM / ARO / WORK_ORDER */
    private String type;
    private String bizType;
    private String bizId;
    private String recipientUserId;
    private String sourceUrl;
    private Integer isRead;
    private LocalDateTime readTime;
    private LocalDateTime createTime;
}
