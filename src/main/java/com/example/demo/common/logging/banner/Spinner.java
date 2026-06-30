package com.example.demo.common.logging.banner;

/**
 * Unicode 盲文旋转指示器 —— 逐帧循环 {@code ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏}。
 * 线程安全，适合后台线程推进帧、渲染线程读取当前帧。
 */
public class Spinner {

    private static final String[] FRAMES = {
        "⠋", // ⠋
        "⠙", // ⠙
        "⠹", // ⠹
        "⠸", // ⠸
        "⠼", // ⠼
        "⠴", // ⠴
        "⠦", // ⠦
        "⠧", // ⠧
        "⠇", // ⠇
        "⠏", // ⠏
    };

    private volatile int index = 0;

    /** 推进一帧并返回帧字符 */
    public String tick() {
        String frame = FRAMES[index];
        index = (index + 1) % FRAMES.length;
        return frame;
    }

    /** 只读当前帧，不推进 */
    public String current() {
        return FRAMES[index];
    }

    /** 重置到第 0 帧 */
    public void reset() {
        index = 0;
    }
}
