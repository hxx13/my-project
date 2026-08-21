package com.example.demo.modules.auth.iam;

/**
 * IAM 登录业务错误码（写入 Result.data.errorCode，便于前端分支）。
 */
public final class IamOAuthErrorCodes {

    private IamOAuthErrorCodes() {
    }

    public static final String PERSON_NOT_FOUND = "PERSON_NOT_FOUND";
    public static final String PERSON_AMBIGUOUS = "PERSON_AMBIGUOUS";
    public static final String ACCOUNT_NOT_PROVISIONED = "ACCOUNT_NOT_PROVISIONED";
    public static final String ACCOUNT_DISABLED = "ACCOUNT_DISABLED";
    public static final String INVALID_REDIRECT_URI = "INVALID_REDIRECT_URI";
    public static final String INVALID_STATE = "INVALID_STATE";
    public static final String OAUTH_FAILED = "OAUTH_FAILED";
    /** 仅当 registration.enabled=true 才可能返回；关闭时禁止进入注册分支 */
    public static final String REGISTRATION_REQUIRED = "REGISTRATION_REQUIRED";
}
