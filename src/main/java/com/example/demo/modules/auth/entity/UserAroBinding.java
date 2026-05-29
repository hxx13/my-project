package com.example.demo.modules.auth.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserAroBinding {
    private Long id;
    private String userId;
    private String aroUserId;
    private LocalDateTime createdAt;
}
