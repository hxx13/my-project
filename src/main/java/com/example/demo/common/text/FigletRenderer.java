package com.example.demo.common.text;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 内置极简 FIGlet 渲染器，零外部依赖，零许可证风险。
 *
 * <p>从 classpath 加载 .flf 字体文件，解析 FIGlet 标准格式并渲染 ASCII 大字标题。
 * 字体加载失败时自动回退为纯文本标题。
 *
 * <h3>用法</h3>
 * <pre>{@code
 * List<String> lines = FigletRenderer.render("TWIN");
 * for (String line : lines) {
 *     System.out.println(line);
 * }
 * }</pre>
 *
 * <p>包路径独立于 {@code logging.banner} —— 文本渲染是通用能力，不属于日志层面。
 */
public final class FigletRenderer {

    private static final Logger log = LoggerFactory.getLogger(FigletRenderer.class);

    private static final String FONT_PATH = "/fonts/big.flf";

    /** 已加载的字体，null 表示尚未加载或加载失败 */
    private static volatile FontData loadedFont;

    private FigletRenderer() {}

    /**
     * 渲染文本为多行字符串列表（供调用方决定如何画框）。
     *
     * @param text 待渲染的纯 ASCII 文本
     * @return 每行一个字符串的列表；字体加载失败时返回单行纯文本
     */
    public static List<String> render(String text) {
        if (text == null || text.isEmpty()) {
            return Collections.emptyList();
        }

        FontData font = getFont();
        if (font == null) {
            return Collections.singletonList(text);
        }

        int height = font.height;
        List<StringBuilder> rows = new ArrayList<>(height);
        for (int i = 0; i < height; i++) {
            rows.add(new StringBuilder());
        }

        for (int ci = 0; ci < text.length(); ci++) {
            char ch = text.charAt(ci);
            String[] glyph = font.glyphs.get(ch);
            if (glyph == null) {
                glyph = font.glyphs.getOrDefault(' ', font.emptyGlyph(height));
            }
            for (int row = 0; row < height; row++) {
                rows.get(row).append(glyph[row]);
            }
        }

        List<String> result = new ArrayList<>(height);
        for (StringBuilder row : rows) {
            String line = row.toString();
            result.add(line.isEmpty() ? " " : line);
        }
        return result;
    }

    /**
     * 返回渲染后最大行宽（供外框宽度计算）。
     */
    public static int widthOf(String text) {
        List<String> lines = render(text);
        int max = 0;
        for (String line : lines) {
            if (line.length() > max) max = line.length();
        }
        return max;
    }

    // ── 字体加载 ──

    private static FontData getFont() {
        if (loadedFont != null) return loadedFont;
        synchronized (FigletRenderer.class) {
            if (loadedFont != null) return loadedFont;
            try {
                loadedFont = loadFont();
            } catch (Exception e) {
                log.warn("FIGlet font load failed ({}): {} — fallback to plain text", FONT_PATH, e.getMessage());
                loadedFont = null;
            }
            return loadedFont;
        }
    }

    /**
     * 解析 FIGlet .flf 字体文件。
     *
     * <p>.flf 格式规范：
     * 第 1 行: flf2a$hardblank height baseline max_length comment_lines
     * 之后 comment_lines 行注释，然后从 ASCII 32 开始的字符字模
     * 每个字模 height 行，每行以 @ 或 @@ 结尾（hardblank）
     */
    private static FontData loadFont() throws IOException {
        InputStream is = FigletRenderer.class.getResourceAsStream(FONT_PATH);
        if (is == null) {
            throw new IOException("Font file not found: " + FONT_PATH);
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null || headerLine.isEmpty()) {
                throw new IOException("Font file is empty");
            }

            String[] parts = headerLine.split(" ");
            String magicAndHardblank = parts[0];
            char hardblank = magicAndHardblank.length() > 5 ? magicAndHardblank.charAt(5) : '$';

            int height = Integer.parseInt(parts[1]);
            int commentLines = parts.length > 5 ? Integer.parseInt(parts[5]) : 0;

            for (int i = 0; i < commentLines; i++) {
                reader.readLine();
            }

            Map<Character, String[]> glyphs = new HashMap<>();
            for (int ch = 32; ch <= 126; ch++) {
                String[] glyph = new String[height];
                for (int row = 0; row < height; row++) {
                    String line = reader.readLine();
                    if (line == null) { glyph[row] = ""; continue; }
                    if (line.endsWith("@@")) {
                        line = line.substring(0, line.length() - 2);
                    } else if (line.endsWith("@")) {
                        line = line.substring(0, line.length() - 1);
                    }
                    glyph[row] = line.replace(hardblank, ' ');
                }
                glyphs.put((char) ch, glyph);
            }

            log.debug("FIGlet font loaded: {} height={} chars={}", FONT_PATH, height, glyphs.size());
            return new FontData(height, glyphs);
        }
    }

    private static class FontData {
        final int height;
        final Map<Character, String[]> glyphs;

        FontData(int height, Map<Character, String[]> glyphs) {
            this.height = height;
            this.glyphs = glyphs;
        }

        String[] emptyGlyph(int h) {
            String[] g = new String[h];
            for (int i = 0; i < h; i++) g[i] = "";
            return g;
        }
    }
}
