package com.example.demo.modules.aro.client;

/**
 * CAS 登录流程异常（密码错误、验证码错误、账号锁定等）。
 */
public class CasLoginException extends Exception {
    public CasLoginException(String message) {
        super(message);
    }

    public CasLoginException(String message, Throwable cause) {
        super(message, cause);
    }
}
