package com.example.demo.modules.notification.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class MiniSubscribeRecord {
    private Long id;
    private String userId;
    private String templateKey;
    private Integer accepted;
    private LocalDateTime updateTime;
}
