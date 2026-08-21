package com.example.demo.modules.auth.iam;

/**
 * IAM OAuth 协议层异常（换票/拉用户信息失败等）。
 */
public class IamOAuthException extends RuntimeException {
    public IamOAuthException(String message) {
        super(message);
    }
}
