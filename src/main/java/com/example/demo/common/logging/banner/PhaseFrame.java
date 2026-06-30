package com.example.demo.common.logging.banner;

/**
 * Unicode 框线渲染器。
 * 提供三种框线风格：
 * <ul>
 *   <li><b>DOUBLE</b> — 标题横幅用 ╔═╗║╚╝</li>
 *   <li><b>LIGHT</b>  — 阶段框用 ┌─┐│└┘</li>
 *   <li><b>RESULT</b> — 最终 READY 框</li>
 * </ul>
 */
public final class PhaseFrame {

    private PhaseFrame() {}

    // --- 框线字符 ---
    private static final String[][] BOX_STYLES = {
        // DOUBLE:  ╔ ═ ╗ ║ ╚ ╝
        {"╔", "═", "╗", "║", "╚", "╝"},
        // LIGHT:   ┌ ─ ┐ │ └ ┘
        {"┌", "─", "┐", "│", "└", "┘"},
        // ROUNDED: ╭ ─ ╮ │ ╰ ╯  (备用)
        {"╭", "─", "╮", "│", "╰", "╯"},
    };

    public static final int DOUBLE  = 0;
    public static final int LIGHT   = 1;
    public static final int ROUNDED = 2;

    /**
     * 渲染一个标题横幅（居中文本）。
     * <pre>
     * ╔══════════════════════════╗
     * ║   🧬 TWIN SYSTEM v2.0   ║
     * ╚══════════════════════════╝
     * </pre>
     */
    public static String banner(String title, String subtitle) {
        int innerWidth = Math.max(title.length(), subtitle != null ? subtitle.length() : 0) + 4;
        String[] s = BOX_STYLES[DOUBLE];
        String c = CyberColor.CYAN;

        StringBuilder sb = new StringBuilder();
        sb.append(c).append(s[0]).append(s[1].repeat(innerWidth)).append(s[2]).append(CyberColor.RESET).append('\n');
        sb.append(c).append(s[3]).append(CyberColor.RESET)
          .append("  ").append(CyberColor.bold(title)).append("  ")
          .append(c).append(s[3]).append(CyberColor.RESET).append('\n');
        if (subtitle != null && !subtitle.isBlank()) {
            sb.append(c).append(s[3]).append(CyberColor.RESET)
              .append("  ").append(CyberColor.gray(subtitle + " ".repeat(innerWidth - subtitle.length() - 4))).append("  ")
              .append(c).append(s[3]).append(CyberColor.RESET).append('\n');
        }
        sb.append(c).append(s[4]).append(s[1].repeat(innerWidth)).append(s[5]).append(CyberColor.RESET);
        return sb.toString();
    }

    /**
     * 渲染一个阶段状态行。
     * <pre>
     *   ◴ 数据库迁移 ...................... ⠋ 3/28 脚本
     *   ✓ 数据库迁移 ...................... 28/28 就绪 (1.2s)
     *   ✗ 数据库迁移 ...................... bootstrap-stranded 执行失败
     * </pre>
     */
    public static String phaseLine(PhaseState state, String spinner, String name, String detail) {
        String indicator;
        switch (state) {
            case RUNNING:
                indicator = CyberColor.MAGENTA + " " + spinner + " " + CyberColor.RESET;
                break;
            case SUCCESS:
                indicator = CyberColor.GREEN + " ✓ " + CyberColor.RESET; // ✓
                break;
            case FAILED:
                indicator = CyberColor.RED + " ✗ " + CyberColor.RESET;   // ✗
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

    /**
     * 渲染结果摘要框（LIGHT 风格）。
     * <pre>
     * ┌──────────────────────────────────────────┐
     * │ ✓  TWIN SYSTEM READY  ·  :8081  ·  6.4s  │
     * │    http://localhost:5173  ·  local        │
     * └──────────────────────────────────────────┘
     * </pre>
     */
    public static String resultBox(boolean success, String... lines) {
        String[] s = BOX_STYLES[LIGHT];
        String c = CyberColor.CYAN;
        int maxLen = 0;
        for (String line : lines) {
            if (line.length() > maxLen) maxLen = line.length();
        }
        int innerWidth = maxLen + 4;

        String indicator = success
                ? CyberColor.GREEN + "✓" + CyberColor.RESET
                : CyberColor.RED + "✗" + CyberColor.RESET;

        StringBuilder sb = new StringBuilder();
        sb.append("  ").append(c).append(s[0]).append(s[1].repeat(innerWidth)).append(s[2]).append(CyberColor.RESET).append('\n');
        for (String line : lines) {
            sb.append("  ").append(c).append(s[3]).append(CyberColor.RESET)
              .append("  ").append(indicator).append("  ")
              .append(CyberColor.WHITE).append(line)
              .append(" ".repeat(Math.max(0, innerWidth - line.length() - 4)))
              .append(CyberColor.RESET)
              .append(c).append(s[3]).append(CyberColor.RESET).append('\n');
        }
        sb.append("  ").append(c).append(s[4]).append(s[1].repeat(innerWidth)).append(s[5]).append(CyberColor.RESET);
        return sb.toString();
    }

    /** 阶段框：┌─ 阶段名 ─┐ */
    public static String phaseBox(String phaseName) {
        String[] s = BOX_STYLES[LIGHT];
        String c = CyberColor.CYAN;
        String inner = " " + phaseName + " ";
        return c + s[0] + s[1].repeat(inner.length()) + s[2] + CyberColor.RESET;
    }

    // --- helpers ---

    private static String dots(int count) {
        if (count <= 0) return "";
        return ".".repeat(count);
    }
}
