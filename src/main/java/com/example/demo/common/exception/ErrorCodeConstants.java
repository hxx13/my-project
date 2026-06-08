package com.example.demo.common.exception;

/**
 * 业务错误码（与 HTTP 状态解耦，放在 Result.code）。
 * 分段：1-模块-子码，便于检索；新增模块请在本类追加常量。
 */
public final class ErrorCodeConstants {

    private ErrorCodeConstants() {
    }

    /** 通用 */
    public static final int BAD_REQUEST = 400;
    public static final int UNAUTHORIZED = 401;
    public static final int FORBIDDEN = 403;
    public static final int NOT_FOUND = 404;
    public static final int INTERNAL_ERROR = 500;

    /** 认证 auth 1-001-xxx */
    public static final int AUTH_LOGIN_FAILED = 1_001_001;
    public static final int AUTH_TOKEN_INVALID = 1_001_002;

    /** 孪生 twin 1-002-xxx */
    public static final int TWIN_JOB_NOT_FOUND = 1_002_001;
    public static final int TWIN_SCAN_WINDOW_DENIED = 1_002_002;

    /** 特殊通道 special-channel 1-004-xxx */
    public static final int SPECIAL_CHANNEL_PIN_ALREADY_SET  = 1_004_001;  // "已设置过个人密码"
    public static final int SPECIAL_CHANNEL_PIN_NOT_SET       = 1_004_002;  // "请先设置个人密码"
    public static final int SPECIAL_CHANNEL_PIN_INVALID       = 1_004_003;  // "个人密码错误"
    public static final int SPECIAL_CHANNEL_PIN_FORMAT        = 1_004_004;  // "密码为6-8位纯数字"
    public static final int SPECIAL_CHANNEL_USER_NOT_FOUND    = 1_004_005;  // "未在人员库中找到该学号"
    public static final int SPECIAL_CHANNEL_PIN_LOCKED        = 1_004_006;  // "密码已锁定，请稍后重试"
    public static final int SPECIAL_CHANNEL_ACCOUNT_DISABLED  = 1_004_007;  // "账号已禁用"
}
