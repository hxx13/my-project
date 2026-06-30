package com.example.demo.modules.student.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class StudentMobileToken {

    private Long id;
    private String token;
    private String userId;
    private LocalDateTime expiresAt;
    private String lastIp;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
