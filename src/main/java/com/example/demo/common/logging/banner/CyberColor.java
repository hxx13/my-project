package com.example.demo.common.logging.banner;

/**
 * 赛博朋克霓虹色板。
 *
 * <p>终端能力检测已提取至 {@link TerminalCapability}。
 * 本类委托 TerminalCapability 提供向后兼容的查询方法。
 */
public final class CyberColor {

    private static final boolean ANSI = TerminalCapability.hasAnsi();

    public static final String RESET   = ANSI ? "\033[0m"    : "";
    public static final String BOLD    = ANSI ? "\033[1m"    : "";
    public static final String GREEN   = ANSI ? "\033[38;2;0;255;65m"   : "";
    public static final String CYAN    = ANSI ? "\033[38;2;0;255;255m"  : "";
    public static final String MAGENTA = ANSI ? "\033[38;2;255;0;255m"  : "";
    public static final String RED     = ANSI ? "\033[38;2;255;0;64m"   : "";
    public static final String AMBER   = ANSI ? "\033[38;2;255;176;0m"  : "";
    public static final String PURPLE  = ANSI ? "\033[38;2;120;0;180m"  : "";
    public static final String GRAY    = ANSI ? "\033[38;2;128;128;128m" : "";
    public static final String WHITE   = ANSI ? "\033[38;2;220;220;220m" : "";

    private CyberColor() {}

    // ── 公共能力查询（委托 TerminalCapability，向后兼容） ──

    public static boolean isTty()      { return TerminalCapability.isTty(); }
    public static boolean hasAnsi()    { return TerminalCapability.hasAnsi(); }
    public static boolean hasUnicode() { return TerminalCapability.hasUnicode(); }

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
