package com.example.demo.modules.auth.entity;

import lombok.Data;

@Data
public class VerificationCode {
    private Long id;
    private String email;
    private String code;
    private String scene;
    private String userId;
    private Integer used;
    private Integer failCount;
    private String resetToken;
    private String expiresAt;
    private String createdAt;
}
