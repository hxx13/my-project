package com.example.demo.common.logging.banner;

/**
 * 进度条：Unicode 8 级细分填充 + ASCII 自动回退。
 *
 * <p>每格 8 级细分（▏▎▍▌▋▊▉█），总精度 = BAR_WIDTH × 8 = 160 单位。
 */
public final class ProgressBar {

    private static final int BAR_WIDTH = 20;
    private static final int SUB_LEVELS = 8;
    private static final int TOTAL_UNITS = BAR_WIDTH * SUB_LEVELS;

    private static final char[] SUB_BLOCKS = {' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'};

    private static final boolean UNICODE = TerminalCapability.hasUnicode();

    private ProgressBar() {}

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

        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < BAR_WIDTH; i++) {
            if (i < fullBlocks) {
                sb.append(UNICODE ? '█' : '#');
            } else if (i == fullBlocks && remainder > 0) {
                sb.append(UNICODE ? SUB_BLOCKS[remainder] : '#');
            } else {
                sb.append(UNICODE ? '░' : '.');
            }
        }
        sb.append("]");
        sb.append(String.format(" %3d%%", (int) (ratio * 100)));
        if (label != null) sb.append("  ").append(label);
        return sb.toString();
    }
}
