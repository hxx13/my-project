package com.example.demo.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OAuthLoginRequest {
    @NotBlank(message = "code 不能为空")
    private String code;
    /** CSRF state；前端必校验，后端若传入则与会话策略可选校验 */
    private String state;
    /** 须与服务端配置 redirect-uri 一致 */
    @NotBlank(message = "redirectUri 不能为空")
    private String redirectUri;
}
