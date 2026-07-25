package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class ForgotPasswordByEmailResetRequest {
    private String resetToken;
    private String newPassword;
    private String newUsername; // 可选，与 QR 方式一致
}
