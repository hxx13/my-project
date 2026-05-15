package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class NotifyTemplate {
    private Long id;
    private String templateKey;
    private String titleTpl;
    private String contentTpl;
    private Integer enabled;
    private LocalDateTime updateTime;
}
