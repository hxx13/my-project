package com.example.demo.modules.auth.service;

/**
 * 统一密码强度校验器。
 * 适用于注册、修改密码、忘记密码重置等全部密码设置入口。
 *
 * 注意：调用方应在传入密码前先做 trim()，确保校验和哈希使用同一份值。
 */
public final class PasswordPolicyValidator {

    private PasswordPolicyValidator() {
    }

    /** 最小密码长度 */
    public static final int MIN_LENGTH = 8;
    /** 最大密码长度 */
    public static final int MAX_LENGTH = 64;

    /**
     * 校验密码强度。
     *
     * @param password 明文密码（调用方应已 trim 过）
     * @return null 表示通过；非 null 为错误提示
     */
    public static String validate(String password) {
        if (password == null || password.isBlank()) {
            return "密码不能为空";
        }
        if (password.length() < MIN_LENGTH) {
            return "密码长度不能少于" + MIN_LENGTH + "位";
        }
        if (password.length() > MAX_LENGTH) {
            return "密码长度不能超过" + MAX_LENGTH + "位";
        }

        int categories = 0;
        if (password.matches(".*[a-z].*")) categories++;       // 小写字母
        if (password.matches(".*[A-Z].*")) categories++;       // 大写字母
        if (password.matches(".*[0-9].*")) categories++;       // 数字
        // 特殊字符：排除字母、数字、空白字符后的任意可打印/非打印字符
        if (password.matches(".*[^a-zA-Z0-9\\s].*")) categories++;

        if (categories < 3) {
            return "密码需至少包含大写字母、小写字母、数字、特殊字符中的三类";
        }
        return null;
    }
}
