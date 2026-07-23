package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class ForgotPasswordVerifyRequest {
    private String userId;
    private String phoneNumber;
}
