package com.example.demo.modules.reportform.service;

import java.util.Locale;
import java.util.Map;

/** 解析 layout 单元格 style 中的颜色（#hex / 设计令牌） */
final class ReportFormColorParser {

    record Rgb(int r, int g, int b) {
        float rf() { return r / 255f; }
        float gf() { return g / 255f; }
        float bf() { return b / 255f; }
    }

    private static final Map<String, String> TOKEN_HEX = Map.ofEntries(
            Map.entry("--app-color-accent", "#FAD4C0"),
            Map.entry("--app-color-accent-soft", "#FFF0E8"),
            Map.entry("--app-color-surface-page", "#FFF5E6"),
            Map.entry("--app-color-surface-container", "#FFFAF3"),
            Map.entry("--app-color-text-primary", "#1a1a1a"),
            Map.entry("--app-color-text-secondary", "#666666"),
            Map.entry("--app-color-feedback-danger", "#e03131"),
            Map.entry("--app-color-feedback-success", "#2f9e44")
    );

    private ReportFormColorParser() {}

    static Rgb parse(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty() || "transparent".equalsIgnoreCase(s) || "inherit".equalsIgnoreCase(s)) {
            return null;
        }
        if (s.startsWith("var(")) {
            s = resolveCssVar(s);
            if (s == null) return null;
        }
        if (s.startsWith("#")) {
            return parseHex(s.substring(1));
        }
        if (s.matches("(?i)[0-9a-f]{6}")) {
            return parseHex(s);
        }
        return null;
    }

    private static String resolveCssVar(String varExpr) {
        int start = varExpr.indexOf("--");
        if (start < 0) return null;
        int end = varExpr.indexOf(')', start);
        String token = end > start ? varExpr.substring(start, end).trim() : varExpr.substring(start).trim();
        return TOKEN_HEX.get(token);
    }

    private static Rgb parseHex(String hex) {
        try {
            String h = hex.toUpperCase(Locale.ROOT);
            if (h.length() == 3) {
                h = "" + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
            }
            if (h.length() != 6) return null;
            return new Rgb(
                    Integer.parseInt(h.substring(0, 2), 16),
                    Integer.parseInt(h.substring(2, 4), 16),
                    Integer.parseInt(h.substring(4, 6), 16));
        } catch (Exception e) {
            return null;
        }
    }
}
