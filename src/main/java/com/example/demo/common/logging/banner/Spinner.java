package com.example.demo.common.logging.banner;

/**
 * 旋转指示器 —— Unicode 盲文 ⠋⠙⠹⠸ 或 ASCII |/-\。
 */
public class Spinner {

    private static final String[] UNICODE_FRAMES = {
        "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"
    };
    private static final String[] ASCII_FRAMES = { "|", "/", "-", "\\" };

    private final String[] frames;
    private volatile int index = 0;

    public Spinner() {
        this.frames = CyberColor.hasUnicode() ? UNICODE_FRAMES : ASCII_FRAMES;
    }

    public String tick() {
        String frame = frames[index];
        index = (index + 1) % frames.length;
        return frame;
    }

    public String current() { return frames[index]; }
    public void reset() { index = 0; }
}
