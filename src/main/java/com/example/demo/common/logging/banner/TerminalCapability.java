package com.example.demo.common.logging.banner;

import java.nio.charset.Charset;

/**
 * 终端能力检测 —— TTY / ANSI / Unicode box-drawing / 编码信息。
 *
 * <p>从 {@link CyberColor} 提取，独立为单一职责类。
 * 同时检查 {@code stdout.encoding}（Java 17 标准属性，JEP 400）和
 * {@code sun.stdout.encoding}（HotSpot 私有属性）以覆盖全系列 JDK。
 */
public final class TerminalCapability {

    /** 是否为交互式终端（IDEA Run 控制台 System.console()=null 但支持 ANSI） */
    private static final boolean TTY = isTtyLike();

    /** 终端编码是否支持 UTF-8 / Unicode box-drawing */
    private static final boolean UNICODE;

    /** 终端是否支持 ANSI 颜色 (Windows 10+ 1703+ 原生支持) */
    private static final boolean ANSI;

    /** 实际检测到的字符编码名称（供运维排查） */
    private static final String CHARSET;

    static {
        boolean uni = false;
        boolean ansi = TTY;
        String detectedCharset = "unknown";

        try {
            // Java 17+ 标准属性优先（JEP 400）
            String enc = System.getProperty("stdout.encoding");
            // HotSpot 私有属性兜底
            if (enc == null) enc = System.getProperty("sun.stdout.encoding");
            // 最终兜底：JVM 默认编码
            if (enc == null) enc = Charset.defaultCharset().name();

            detectedCharset = enc;
            if (enc != null) {
                uni = enc.toUpperCase().contains("UTF");
            }

            // Windows Terminal: 通过环境变量识别
            String wt = System.getenv("WT_SESSION");
            if (wt != null) { uni = true; ansi = true; }

            // IDE 终端 (IntelliJ, VSCode) 通常同时支持 UTF-8 + ANSI
            String term = System.getenv("TERM");
            if (term != null && (term.contains("xterm") || term.contains("screen"))) {
                uni = true;
                ansi = true;
            }
        } catch (Exception ignored) {
            detectedCharset = "error";
        }

        UNICODE = uni;
        ANSI = ansi;
        CHARSET = detectedCharset;
    }

    private TerminalCapability() {}

    /** TTY 判定：真实终端 > IDE 控制台（IntelliJ/VSCode/Eclipse）> dumb 回退 */
    private static boolean isTtyLike() {
        // 真实终端
        if (System.console() != null && !"dumb".equals(System.getenv("TERM"))) {
            return true;
        }
        // IDE Run 控制台 — java.class.path 含 idea_rt.jar 或用 idea.launcher.bin.path
        if (System.getProperty("idea.launcher.bin.path") != null) return true;
        if (System.getProperty("java.class.path", "").contains("idea_rt.jar")) return true;
        // VSCode / Eclipse 等
        if (System.getenv("TERM_PROGRAM") != null) return true;
        if (System.getProperty("os.name", "").toLowerCase().contains("win")) return true;
        return false;
    }

    public static boolean isTty()      { return TTY; }
    public static boolean hasAnsi()    { return ANSI; }
    public static boolean hasUnicode() { return UNICODE; }

    /** 实际检测到的字符编码名称，便于运维验证编码配置是否生效。 */
    public static String detectedCharset() { return CHARSET; }
}
