package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class WebLoginRequest {
    private String username;
    private String password;
    /**
     * Cloudflare Turnstile 验证令牌（前端 widget 生成）。
     */
    private String turnstileToken;
}
