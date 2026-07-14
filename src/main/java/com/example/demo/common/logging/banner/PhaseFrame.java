package com.example.demo.common.logging.banner;

/**
 * 框线渲染器 —— Unicode ╔═╗ 或 ASCII +===+ 自动回退。
 */
public final class PhaseFrame {

    private PhaseFrame() {}

    public static String ok()   { return TerminalCapability.hasUnicode() ? "✓" : "OK"; }
    public static String fail() { return TerminalCapability.hasUnicode() ? "✗" : "ERR"; }

    /** 标题框 */
    public static String banner(String title, String subtitle) {
        int innerWidth = Math.max(title.length(), subtitle != null ? subtitle.length() : 0) + 4;

        StringBuilder sb = new StringBuilder();
        if (TerminalCapability.hasUnicode()) {
            sb.append("╔").append("═".repeat(innerWidth)).append("╗").append('\n');
            sb.append("║").append("  ").append(title).append("  ").append("║").append('\n');
            if (subtitle != null && !subtitle.isBlank()) {
                sb.append("║").append("  ").append(subtitle).append("  ").append("║").append('\n');
            }
            sb.append("╚").append("═".repeat(innerWidth)).append("╝");
        } else {
            String bar = "+" + "-".repeat(innerWidth) + "+";
            sb.append(bar).append('\n');
            sb.append("|").append("  ").append(title).append("  ").append("|").append('\n');
            if (subtitle != null && !subtitle.isBlank()) {
                sb.append("|").append("  ").append(subtitle).append("  ").append("|").append('\n');
            }
            sb.append(bar);
        }
        return sb.toString();
    }

    /** 阶段状态行 */
    public static String phaseLine(PhaseState state, String spinner, String name, String detail) {
        String indicator = switch (state) {
            case RUNNING -> " " + (spinner != null ? spinner : " ") + " ";
            case SUCCESS -> " " + ok() + " ";
            case FAILED -> " " + fail() + " ";
            default -> "   ";
        };
        String detailPart = detail != null && !detail.isEmpty() ? " " + detail : "";
        return "  " + indicator + " " + name + " " + dots(40 - name.length()) + detailPart;
    }

    /** 摘要框 */
    public static String resultBox(boolean success, String... lines) {
        int maxLen = 0;
        for (String line : lines) if (line.length() > maxLen) maxLen = line.length();
        int innerWidth = maxLen + 4;

        String indicator = "  " + (success ? ok() : fail()) + "  ";

        StringBuilder sb = new StringBuilder();
        String top, mid, bot;
        if (TerminalCapability.hasUnicode()) {
            top = "┌" + "─".repeat(innerWidth) + "┐";
            mid = "│";
            bot = "└" + "─".repeat(innerWidth) + "┘";
        } else {
            top = "+" + "-".repeat(innerWidth) + "+";
            mid = "|";
            bot = "+" + "-".repeat(innerWidth) + "+";
        }

        sb.append("  ").append(top).append('\n');
        for (String line : lines) {
            sb.append("  ").append(mid)
              .append(indicator).append(line)
              .append(" ".repeat(Math.max(0, innerWidth - line.length() - 4)))
              .append(mid).append('\n');
        }
        sb.append("  ").append(bot);
        return sb.toString();
    }

    private static String dots(int count) {
        return count <= 0 ? "" : ".".repeat(count);
    }
}
