package com.example.demo.modules.notification.push;

public final class PushConstants {
    private PushConstants() {}
    public static final String CHANNEL_EMAIL = "EMAIL";
    public static final String CHANNEL_SERVER_CHAN = "SERVER_CHAN";
    public static final String CHANNEL_WXPUSHER = "WXPUSHER";
    public static final String PERSPECTIVE_STUDENT = "STUDENT";
    public static final String PERSPECTIVE_STAFF = "STAFF";
    public static final String PERSPECTIVE_ALL = "ALL";
    public static final String SCOPE_ALL = "ALL";
    public static final String SCOPE_ROLE = "ROLE";
    public static final String SCOPE_USER = "USER";
    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_FAILED = "FAILED";
    public static final String STATUS_SKIPPED_QUIET = "SKIPPED_QUIET";
    public static final String STATUS_SKIPPED_RATE_LIMIT = "SKIPPED_RATE_LIMIT";
    public static final String CONFIG_MODULE = "push_channel";
    /**
     * 「全体聚合」哨兵 —— 遥测报警写 notify_digest_item 明细时用的**伪账号**，
     * 不是真实账号、没有渠道绑定。它的实际投递走遥测那侧的即时推送，
     * 按人聚合的那条路必须跳过它，否则每轮都会刷一条「0 channels hit」的 WARN。
     */
    public static final String ALL_DIGEST_USER = "ALL_DIGEST";
}
