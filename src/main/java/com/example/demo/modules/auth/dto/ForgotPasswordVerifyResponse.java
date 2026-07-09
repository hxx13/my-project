package com.example.demo.modules.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ForgotPasswordVerifyResponse {
    private boolean verified;
    private String username;
    private String message;

    public static ForgotPasswordVerifyResponse success(String username) {
        ForgotPasswordVerifyResponse r = new ForgotPasswordVerifyResponse();
        r.verified = true;
        r.username = username;
        r.message = "验证通过";
        return r;
    }

    public static ForgotPasswordVerifyResponse fail(String message) {
        ForgotPasswordVerifyResponse r = new ForgotPasswordVerifyResponse();
        r.verified = false;
        r.username = null;
        r.message = message;
        return r;
    }
}
