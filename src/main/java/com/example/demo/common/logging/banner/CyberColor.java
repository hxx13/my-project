package com.example.demo.common.logging.banner;

import java.nio.charset.Charset;

/**
 * 赛博朋克霓虹色板 + 终端能力检测。
 *
 * <p>自动检测：① TTY ② ANSI 颜色支持 ③ Unicode box-drawing 支持。
 * Windows CMD/GBK 终端自动回退 ASCII 字符。
 */
public final class CyberColor {

    // ── 终端能力检测 ──

    /** 是否为交互式终端 */
    private static final boolean TTY = System.console() != null
            && !"dumb".equals(System.getenv("TERM"));

    /** 终端编码是否支持 UTF-8 / Unicode box-drawing */
    private static final boolean UNICODE;

    /** 终端是否支持 ANSI 颜色 (Windows 10+ 1703+ 原生支持) */
    private static final boolean ANSI;

    static {
        boolean uni = false;
        boolean ansi = TTY;
        try {
            String enc = System.getProperty("sun.stdout.encoding");
            if (enc == null) enc = Charset.defaultCharset().name();
            if (enc != null) {
                uni = enc.toUpperCase().contains("UTF");
                // Windows 10+ 终端即使 GBK 也支持 ANSI，但 box-drawing 需要 UTF-8
            }
            // Windows Terminal / new Windows Console: check via env
            String wt = System.getenv("WT_SESSION");
            if (wt != null) { uni = true; ansi = true; }
            // IDE consoles (IntelliJ, VSCode) usually support both
            String term = System.getenv("TERM");
            if (term != null && (term.contains("xterm") || term.contains("screen"))) {
                uni = true; ansi = true;
            }
        } catch (Exception ignored) {}
        UNICODE = uni;
        ANSI = ansi;
    }

    // ── 颜色码 (ANSI True-Color) ──

    public static final String RESET  = ANSI ? "[0m"    : "";
    public static final String BOLD   = ANSI ? "[1m"    : "";
    public static final String GREEN   = ANSI ? "[38;2;0;255;65m"   : "";
    public static final String CYAN    = ANSI ? "[38;2;0;255;255m"  : "";
    public static final String MAGENTA = ANSI ? "[38;2;255;0;255m"  : "";
    public static final String RED     = ANSI ? "[38;2;255;0;64m"   : "";
    public static final String AMBER   = ANSI ? "[38;2;255;176;0m"  : "";
    public static final String PURPLE  = ANSI ? "[38;2;120;0;180m"  : "";
    public static final String GRAY    = ANSI ? "[38;2;128;128;128m" : "";
    public static final String WHITE   = ANSI ? "[38;2;220;220;220m" : "";

    private CyberColor() {}

    // ── 公共能力查询 ──

    public static boolean isTty()     { return TTY; }
    public static boolean hasAnsi()   { return ANSI; }
    public static boolean hasUnicode(){ return UNICODE; }

    // ── 修饰方法 ──

    public static String bold(String text)     { return BOLD + text + RESET; }
    public static String green(String text)    { return GREEN + text + RESET; }
    public static String cyan(String text)     { return CYAN + text + RESET; }
    public static String magenta(String text)  { return MAGENTA + text + RESET; }
    public static String red(String text)      { return RED + text + RESET; }
    public static String amber(String text)    { return AMBER + text + RESET; }
    public static String gray(String text)     { return GRAY + text + RESET; }
    public static String white(String text)    { return WHITE + text + RESET; }

    public static String paint(String color, String text) { return color + text + RESET; }
    public static String prefix(String color)             { return color; }
    public static String reset()                          { return RESET; }
}
