package com.example.demo.common.logging.banner;

/**
 * 通用 Unicode 框线包裹器 —— 根据日志级别自动选择框线风格和颜色。
 *
 * <pre>{@code
 * // 单行
 * CyberBox.info("TWIN SYSTEM READY · :8081 · 6.4s");
 * // →
 * // ┌──────────────────────────────────────┐
 * // │ ✓  TWIN SYSTEM READY · :8081 · 6.4s   │
 * // └──────────────────────────────────────┘
 *
 * // 多行
 * CyberBox.error("连接失败", "数据库 192.168.1.1:3306 不可达", "请检查网络或 VPN 连接");
 * }</pre>
 */
public final class CyberBox {

    private CyberBox() {}

    /** INFO 级别：青色框 + 绿色 ✓ */
    public static String info(String... lines) {
        return box(CyberColor.CYAN, CyberColor.GREEN + "✓" + CyberColor.RESET, lines);
    }

    /** WARN 级别：琥珀色框 + 琥珀色 ! */
    public static String warn(String... lines) {
        return box(CyberColor.AMBER, CyberColor.AMBER + "!" + CyberColor.RESET, lines);
    }

    /** ERROR 级别：红色框 + 红色 ✗ */
    public static String error(String... lines) {
        return box(CyberColor.RED, CyberColor.RED + "✗" + CyberColor.RESET, lines);
    }

    /** SUCCESS 级别：绿色框 + 绿色 ✓ */
    public static String success(String... lines) {
        return box(CyberColor.GREEN, CyberColor.GREEN + "✓" + CyberColor.RESET, lines);
    }

    // ─────────── internal ───────────

    private static String box(String borderColor, String indicator, String... lines) {
        int maxLen = 0;
        for (String line : lines) {
            if (line.length() > maxLen) maxLen = line.length();
        }
        int innerWidth = maxLen + 4; // 2 padding each side

        StringBuilder sb = new StringBuilder();
        // top
        sb.append("  ").append(borderColor).append("┌").append("─".repeat(innerWidth)).append("┐")
          .append(CyberColor.RESET).append('\n');
        // content
        for (String line : lines) {
            sb.append("  ").append(borderColor).append("│").append(CyberColor.RESET)
              .append("  ").append(indicator).append("  ")
              .append(CyberColor.WHITE).append(line)
              .append(" ".repeat(Math.max(0, innerWidth - line.length() - 4)))
              .append(CyberColor.RESET)
              .append(borderColor).append("│").append(CyberColor.RESET).append('\n');
        }
        // bottom
        sb.append("  ").append(borderColor).append("└").append("─".repeat(innerWidth)).append("┘")
          .append(CyberColor.RESET);
        return sb.toString();
    }

    /** 快速打印 INFO 框到 stderr */
    public static void printInfo(String... lines) {
        System.err.println(info(lines));
    }

    /** 快速打印 ERROR 框到 stderr */
    public static void printError(String... lines) {
        System.err.println(error(lines));
    }
}
