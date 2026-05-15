package com.example.demo.modules.auth;

/**
 * sys_user.auth_profile：用于小程序首页默认分栏等（后台可读）。
 */
public final class AuthProfileConstants {

    private AuthProfileConstants() {
    }

    /** 微信静默 + ARO 学号/工号绑定 */
    public static final String WECHAT_ARO = "WECHAT_ARO";

    /** Web 账号密码登录体系（或未走微信绑定链路的账号） */
    public static final String WEB_PASSWORD = "WEB_PASSWORD";

    public static String miniHomeDefaultTab(String authProfile) {
        if (WECHAT_ARO.equalsIgnoreCase(trim(authProfile))) {
            return "news";
        }
        return "announcements";
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }
}
