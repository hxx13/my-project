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

    /**
     * Turnstile widget 是否加载失败（CDN 超时/网络问题）。
     * true=CDN 故障，后端降级放行；false/未传=正常模式，无 token 时拒绝。
     */
    private boolean turnstileLoadFailed;
}
