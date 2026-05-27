package com.example.demo.modules.accessfusion.support;

import org.springframework.util.StringUtils;

/**
 * 大华 {@code enter_or_exit}：1=进入，2=离开。
 */
public final class SwingDirectionFilterSupport {

    public static final String ALL = "ALL";
    public static final String ENTER = "ENTER";
    public static final String EXIT = "EXIT";

    private SwingDirectionFilterSupport() {}

    public static String normalize(String raw) {
        if (!StringUtils.hasText(raw)) {
            return ALL;
        }
        String u = raw.trim().toUpperCase();
        return switch (u) {
            case ENTER, EXIT -> u;
            default -> ALL;
        };
    }

    /** {@code null} 表示不筛进出 */
    public static Integer toEnterOrExit(String filter) {
        return switch (normalize(filter)) {
            case ENTER -> 1;
            case EXIT -> 2;
            default -> null;
        };
    }

    public static String directionFromEnterOrExit(Integer enterOrExit) {
        if (enterOrExit == null) {
            return null;
        }
        return enterOrExit == 1 ? ENTER : enterOrExit == 2 ? EXIT : null;
    }

    public static String label(String filter) {
        return switch (normalize(filter)) {
            case ENTER -> "仅进入";
            case EXIT -> "仅离开";
            default -> "进出：全部";
        };
    }

    public static String labelFromEnterOrExit(Integer enterOrExit) {
        if (enterOrExit == null) {
            return "未知";
        }
        return enterOrExit == 1 ? "进入" : enterOrExit == 2 ? "离开" : "未知";
    }
}
