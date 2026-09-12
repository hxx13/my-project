package com.example.demo.common.text;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 内置块状大字标题，取代原来的 {@code FigletRenderer}。
 *
 * <p>原实现从 classpath 读 {@code /fonts/big.flf}，而该字体文件从未随仓库提供，
 * 加载失败后静默回退成单行纯文本 —— 也就是说"大字标题"从来没真正出现过。
 * 改为硬编码字形表：零 IO、零许可证风险、必定渲染成功。
 */
public final class BlockTitle {

    /** 字形高度（行数）。 */
    public static final int HEIGHT = 6;

    private static final Map<Character, String[]> GLYPHS = Map.of(
            'T', new String[]{
                    "████████╗",
                    "╚══██╔══╝",
                    "   ██║   ",
                    "   ██║   ",
                    "   ██║   ",
                    "   ╚═╝   "},
            'W', new String[]{
                    "██╗    ██╗",
                    "██║    ██║",
                    "██║ █╗ ██║",
                    "██║███╗██║",
                    "╚███╔███╔╝",
                    " ╚══╝╚══╝ "},
            'I', new String[]{
                    "██╗",
                    "██║",
                    "██║",
                    "██║",
                    "██║",
                    "╚═╝"},
            'N', new String[]{
                    "███╗   ██╗",
                    "████╗  ██║",
                    "██╔██╗ ██║",
                    "██║╚██╗██║",
                    "██║ ╚████║",
                    "╚═╝  ╚═══╝"});

    private BlockTitle() {}

    /**
     * 渲染为 {@value #HEIGHT} 行等宽大字。
     *
     * @return 未收录字符时返回只含原文的单元素列表，调用方据此走纯文本回退分支
     */
    public static List<String> render(String text) {
        if (text == null || text.isEmpty()) return List.of();
        for (int i = 0; i < text.length(); i++) {
            if (!GLYPHS.containsKey(text.charAt(i))) return List.of(text);
        }
        List<String> lines = new ArrayList<>(HEIGHT);
        for (int row = 0; row < HEIGHT; row++) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < text.length(); i++) {
                if (i > 0) sb.append(' ');
                sb.append(GLYPHS.get(text.charAt(i))[row]);
            }
            lines.add(sb.toString());
        }
        return lines;
    }
}
