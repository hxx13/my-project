package com.example.demo.common.logging.banner;

/**
 * 赛博朋克霓虹色板 —— ANSI 256 色 + 24-bit True Color。
 * 所有方法返回 ANSI 转义序列前缀字符串。
 * 自动检测 TTY：非交互式终端返回空串（剥离颜色）。
 */
public final class CyberColor {

    private static final boolean TTY = System.console() != null
            && !"dumb".equals(System.getenv("TERM"));

    // --- 8-bit ANSI 基础 ---
    public static final String RESET  = TTY ? "[0m"    : "";
    public static final String BOLD   = TTY ? "[1m"    : "";

    // --- True Color 霓虹色板 ---
    // 矩阵绿
    public static final String GREEN   = TTY ? "[38;2;0;255;65m"    : "";
    // 霓虹青
    public static final String CYAN    = TTY ? "[38;2;0;255;255m"   : "";
    // 霓虹粉/品红
    public static final String MAGENTA = TTY ? "[38;2;255;0;255m"   : "";
    // 警报红
    public static final String RED     = TTY ? "[38;2;255;0;64m"    : "";
    // 琥珀色
    public static final String AMBER   = TTY ? "[38;2;255;176;0m"   : "";
    // 暗紫
    public static final String PURPLE  = TTY ? "[38;2;120;0;180m"   : "";
    // 灰（次要信息）
    public static final String GRAY    = TTY ? "[38;2;128;128;128m"  : "";
    // 白
    public static final String WHITE   = TTY ? "[38;2;220;220;220m"  : "";

    private CyberColor() {}

    // --- 修饰方法 ---

    /** 加粗文本 */
    public static String bold(String text)     { return BOLD + text + RESET; }
    /** 绿色（成功） */
    public static String green(String text)    { return GREEN + text + RESET; }
    /** 青色（标题/边框） */
    public static String cyan(String text)     { return CYAN + text + RESET; }
    /** 品红（进度/动画） */
    public static String magenta(String text)  { return MAGENTA + text + RESET; }
    /** 红色（失败/错误） */
    public static String red(String text)      { return RED + text + RESET; }
    /** 琥珀色（警告） */
    public static String amber(String text)    { return AMBER + text + RESET; }
    /** 灰色（次要信息） */
    public static String gray(String text)     { return GRAY + text + RESET; }
    /** 白色 */
    public static String white(String text)    { return WHITE + text + RESET; }

    /** 拼接：前缀色 + 文本 + reset */
    public static String paint(String color, String text) {
        return color + text + RESET;
    }

    /** 仅拼接前缀色（调用者自己 reset） */
    public static String prefix(String color) {
        return color;
    }

    public static String reset() { return RESET; }
    public static boolean isTty() { return TTY; }
}
