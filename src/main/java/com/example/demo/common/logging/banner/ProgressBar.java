package com.example.demo.common.logging.banner;

/**
 * 赛博朋克进度条：{@code [████████░░░░░░░░] 50% (14/28)}。
 * 无 TTY 时输出纯文本百分比。
 */
public final class ProgressBar {

    private static final int BAR_WIDTH = 20;
    private static final char FILL  = '█'; // █
    private static final char EMPTY = '░'; // ░

    private ProgressBar() {}

    /**
     * 渲染当前进度。
     * @param current 已完成数
     * @param total   总数
     * @param label   可选标签（如 "脚本"）
     */
    public static String render(int current, int total, String label) {
        if (!CyberColor.isTty()) {
            String pct = total > 0 ? (current * 100 / total) + "%" : "?%";
            return label != null
                    ? String.format("%s %s (%d/%d)", label, pct, current, total)
                    : String.format("%s (%d/%d)", pct, current, total);
        }

        int filled = total > 0 ? (int) ((long) current * BAR_WIDTH / total) : 0;
        StringBuilder sb = new StringBuilder();
        sb.append(CyberColor.GREEN);
        for (int i = 0; i < BAR_WIDTH; i++) {
            sb.append(i < filled ? FILL : EMPTY);
        }
        sb.append(CyberColor.RESET);

        int pct = total > 0 ? (current * 100 / total) : 0;
        sb.append(String.format(" %s%3d%%%s", CyberColor.CYAN, pct, CyberColor.RESET));

        if (label != null) {
            sb.append(String.format("  %s%s%s", CyberColor.GRAY, label, CyberColor.RESET));
        }

        return sb.toString();
    }
}
