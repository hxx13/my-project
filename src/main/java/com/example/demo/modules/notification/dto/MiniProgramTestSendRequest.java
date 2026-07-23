package com.example.demo.modules.notification.dto;

import lombok.Data;

@Data
public class MiniProgramTestSendRequest {
    private String targetUserId;
    private String templateKey;
}
