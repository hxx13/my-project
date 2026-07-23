package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class ForgotPasswordResetRequest {
    private String userId;
    private String newUsername;
    private String newPassword;
}
