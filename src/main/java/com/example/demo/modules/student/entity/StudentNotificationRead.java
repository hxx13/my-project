package com.example.demo.modules.student.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class StudentNotificationRead {

    private Long id;
    private String userId;
    private String noticeId;
    private LocalDateTime readAt;
}
