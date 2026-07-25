package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class SendVerificationCodeRequest {
    private String email;
    private String scene; // BIND_EMAIL | FORGOT_PASSWORD
}
