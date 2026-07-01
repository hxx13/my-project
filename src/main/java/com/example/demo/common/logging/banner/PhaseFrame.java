package com.example.demo.common.logging.banner;

/**
 * 框线渲染器 —— Unicode ╔═╗ 或 ASCII +===+ 自动回退。
 */
public final class PhaseFrame {

    private PhaseFrame() {}

    /** Unicode 成功标记 */
    public static String ok()   { return CyberColor.hasUnicode() ? "✓" : "OK"; }
    /** Unicode 失败标记 */
    public static String fail() { return CyberColor.hasUnicode() ? "✗" : "ERR"; }

    // ── 框线字符 ──

    /** 标题框 */
    public static String banner(String title, String subtitle) {
        int innerWidth = Math.max(title.length(), subtitle != null ? subtitle.length() : 0) + 4;
        String c = CyberColor.CYAN;

        StringBuilder sb = new StringBuilder();
        if (CyberColor.hasUnicode()) {
            sb.append(c).append("╔").append("═".repeat(innerWidth)).append("╗").append(CyberColor.RESET).append('\n');
            sb.append(c).append("║").append(CyberColor.RESET)
              .append("  ").append(CyberColor.bold(title)).append("  ")
              .append(c).append("║").append(CyberColor.RESET).append('\n');
            if (subtitle != null && !subtitle.isBlank()) {
                sb.append(c).append("║").append(CyberColor.RESET)
                  .append("  ").append(CyberColor.gray(subtitle)).append("  ")
                  .append(c).append("║").append(CyberColor.RESET).append('\n');
            }
            sb.append(c).append("╚").append("═".repeat(innerWidth)).append("╝").append(CyberColor.RESET);
        } else {
            String bar = "+" + "-".repeat(innerWidth) + "+";
            sb.append(c).append(bar).append(CyberColor.RESET).append('\n');
            sb.append(c).append("|").append(CyberColor.RESET)
              .append("  ").append(title).append("  ")
              .append(c).append("|").append(CyberColor.RESET).append('\n');
            if (subtitle != null && !subtitle.isBlank()) {
                sb.append(c).append("|").append(CyberColor.RESET)
                  .append("  ").append(subtitle).append("  ")
                  .append(c).append("|").append(CyberColor.RESET).append('\n');
            }
            sb.append(c).append(bar).append(CyberColor.RESET);
        }
        return sb.toString();
    }

    /** 阶段状态行 */
    public static String phaseLine(PhaseState state, String spinner, String name, String detail) {
        String indicator;
        switch (state) {
            case RUNNING:
                String sp = spinner != null ? spinner : " ";
                indicator = CyberColor.MAGENTA + " " + sp + " " + CyberColor.RESET;
                break;
            case SUCCESS:
                indicator = CyberColor.GREEN + " " + ok() + " " + CyberColor.RESET;
                break;
            case FAILED:
                indicator = CyberColor.RED + " " + fail() + " " + CyberColor.RESET;
                break;
            default:
                indicator = "   ";
        }

        String namePart = CyberColor.WHITE + name + CyberColor.RESET;
        String dots = CyberColor.GRAY + dots(40 - name.length()) + CyberColor.RESET;
        String detailPart = detail != null && !detail.isEmpty()
                ? " " + (state == PhaseState.FAILED ? CyberColor.RED : CyberColor.GRAY) + detail + CyberColor.RESET
                : "";

        return "  " + indicator + " " + namePart + " " + dots + detailPart;
    }

    /** 摘要框 */
    public static String resultBox(boolean success, String... lines) {
        String c = CyberColor.CYAN;
        int maxLen = 0;
        for (String line : lines) if (line.length() > maxLen) maxLen = line.length();
        int innerWidth = maxLen + 4;

        String indicator = success
                ? CyberColor.GREEN + ok() + CyberColor.RESET
                : CyberColor.RED + fail() + CyberColor.RESET;

        StringBuilder sb = new StringBuilder();
        String top, mid, bot;
        if (CyberColor.hasUnicode()) {
            top = c + "┌" + "─".repeat(innerWidth) + "┐" + CyberColor.RESET;
            mid = c + "│" + CyberColor.RESET;
            bot = c + "└" + "─".repeat(innerWidth) + "┘" + CyberColor.RESET;
        } else {
            top = c + "+" + "-".repeat(innerWidth) + "+" + CyberColor.RESET;
            mid = c + "|" + CyberColor.RESET;
            bot = c + "+" + "-".repeat(innerWidth) + "+" + CyberColor.RESET;
        }

        sb.append("  ").append(top).append('\n');
        for (String line : lines) {
            sb.append("  ").append(mid)
              .append("  ").append(indicator).append("  ")
              .append(CyberColor.WHITE).append(line)
              .append(" ".repeat(Math.max(0, innerWidth - line.length() - 4)))
              .append(CyberColor.RESET).append(mid).append('\n');
        }
        sb.append("  ").append(bot);
        return sb.toString();
    }

    private static String dots(int count) {
        if (count <= 0) return "";
        return ".".repeat(count);
    }
}
