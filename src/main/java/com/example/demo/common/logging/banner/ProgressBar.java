package com.example.demo.common.logging.banner;

/**
 * 进度条：Unicode █░ 或 ASCII #. 回退。
 */
public final class ProgressBar {

    private static final int BAR_WIDTH = 20;
    private static final char FILL  = CyberColor.hasUnicode() ? '█' : '#';
    private static final char EMPTY = CyberColor.hasUnicode() ? '░' : '.';

    private ProgressBar() {}

    public static String render(int current, int total, String label) {
        if (!CyberColor.isTty()) {
            String pct = total > 0 ? (current * 100 / total) + "%" : "?%";
            return label != null
                    ? String.format("%s %s (%d/%d)", label, pct, current, total)
                    : String.format("%s (%d/%d)", pct, current, total);
        }

        int filled = total > 0 ? (int) ((long) current * BAR_WIDTH / total) : 0;
        StringBuilder sb = new StringBuilder();
        if (CyberColor.hasAnsi()) sb.append(CyberColor.GREEN);
        for (int i = 0; i < BAR_WIDTH; i++) {
            sb.append(i < filled ? FILL : EMPTY);
        }
        if (CyberColor.hasAnsi()) sb.append(CyberColor.RESET);

        int pct = total > 0 ? (current * 100 / total) : 0;
        if (CyberColor.hasAnsi()) sb.append(CyberColor.CYAN);
        sb.append(String.format(" %3d%%", pct));
        if (CyberColor.hasAnsi()) sb.append(CyberColor.RESET);

        if (label != null) {
            sb.append("  ").append(CyberColor.GRAY).append(label).append(CyberColor.RESET);
        }

        return sb.toString();
    }
}
