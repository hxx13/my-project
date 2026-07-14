package com.example.demo.common.logging.banner;

/**
 * 进度条：Unicode 8 级细分填充 + 分段着色，ASCII 自动回退。
 *
 * <p>每格 8 级细分（▏▎▍▌▋▊▉█），总精度 = BAR_WIDTH × 8 = 160 单位。
 * 分段着色：0-50% 绿 → 50-80% 琥珀 → 80-100% 青。
 */
public final class ProgressBar {

    private static final int BAR_WIDTH = 20;
    private static final int SUB_LEVELS = 8;
    private static final int TOTAL_UNITS = BAR_WIDTH * SUB_LEVELS; // = 160

    private static final char[] SUB_BLOCKS = {' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'};

    private static final boolean UNICODE = TerminalCapability.hasUnicode();
    private static final boolean ANSI   = TerminalCapability.hasAnsi();

    private ProgressBar() {}

    /**
     * 渲染进度条。
     *
     * @param current 当前进度值
     * @param total   总进度值
     * @param label   可选标签（显示在进度条右侧）
     * @return 格式化后的进度条字符串
     */
    public static String render(int current, int total, String label) {
        if (!TerminalCapability.isTty()) {
            String pct = total > 0 ? (current * 100 / total) + "%" : "?%";
            return pct + (label != null ? " " + label : "");
        }

        double ratio = total > 0 ? (double) current / total : 0;

        long numerator = (long) current * TOTAL_UNITS;
        int filled8 = total > 0 ? (int) (numerator / total) : 0;
        int fullBlocks = filled8 / SUB_LEVELS;
        int remainder  = filled8 % SUB_LEVELS;

        StringBuilder sb = new StringBuilder();
        String color = colorForRatio(ratio);

        for (int i = 0; i < BAR_WIDTH; i++) {
            if (i < fullBlocks) {
                if (ANSI) sb.append(color);
                sb.append(UNICODE ? '█' : '#');
            } else if (i == fullBlocks && remainder > 0) {
                if (ANSI) sb.append(color);
                sb.append(UNICODE ? SUB_BLOCKS[remainder] : '#');
            } else {
                if (ANSI) sb.append(CyberColor.GRAY);
                sb.append(UNICODE ? '░' : '.');
            }
        }
        if (ANSI) sb.append(CyberColor.RESET);

        int pct = (int) (ratio * 100);
        if (ANSI) sb.append(CyberColor.CYAN);
        sb.append(String.format(" %3d%%", pct));
        if (ANSI) sb.append(CyberColor.RESET);

        if (label != null) {
            sb.append("  ");
            if (ANSI) sb.append(CyberColor.GRAY);
            sb.append(label);
            if (ANSI) sb.append(CyberColor.RESET);
        }

        return sb.toString();
    }

    private static String colorForRatio(double ratio) {
        if (ratio < 0.5) return CyberColor.GREEN;
        if (ratio < 0.8) return CyberColor.AMBER;
        return CyberColor.CYAN;
    }
}
