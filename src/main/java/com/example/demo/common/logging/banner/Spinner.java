package com.example.demo.common.logging.banner;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * 旋转指示器 —— 多套帧方案，Unicode/ASCII 自动适配。
 *
 * <p>默认 {@link SpinnerStyle#SHUTTLE}（穿梭条 ▏→█→▏），视觉厚重显眼。
 * 线程安全：使用 {@link AtomicInteger} 替代 volatile int 保证并发 tick 正确性。
 */
public class Spinner {

    private final String[] frames;
    private final AtomicInteger index = new AtomicInteger(0);

    /**
     * 旋转指示器帧方案。
     */
    public enum SpinnerStyle {
        /** 穿梭条 ▏▎▍▌▋▊▉█▉▊▋▌▍▎▏（厚重显眼，推荐默认） */
        SHUTTLE(new String[]{"▏","▎","▍","▌","▋","▊","▉","█","▉","▊","▋","▌","▍","▎"}),
        /** 脉冲圆点 ● ◉ ◎ ◉（简洁醒目） */
        PULSE  (new String[]{"●","◉","◎","◉"}),
        /** 经典 Braille ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ */
        CLASSIC(new String[]{"⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"}),
        /** 圆点阵 ⣾⣽⣻⢿⡿⣟⣯⣷ (Claude Code 风格) */
        DOTS   (new String[]{"⣾","⣽","⣻","⢿","⡿","⣟","⣯","⣷"}),
        /** 弧形 ◜◝◞◟（极简） */
        ARC    (new String[]{"◜","◝","◞","◟"});

        final String[] frames;

        SpinnerStyle(String[] frames) {
            this.frames = frames;
        }
    }

    /** 默认构造：SHUTTLE 方案，非 Unicode 终端自动回退 ASCII */
    public Spinner() {
        this(SpinnerStyle.SHUTTLE);
    }

    /** 指定帧方案构造。非 Unicode 终端自动回退 ASCII 等效帧。 */
    public Spinner(SpinnerStyle style) {
        if (CyberColor.hasUnicode()) {
            this.frames = style.frames;
        } else {
            this.frames = new String[]{"|", "/", "-", "\\"};
        }
    }

    /** 推进一帧并返回当前帧字符。线程安全。 */
    public String tick() {
        return frames[index.getAndUpdate(i -> (i + 1) % frames.length)];
    }

    /** 返回当前帧字符（不推进）。 */
    public String current() {
        return frames[index.get()];
    }

    /** 重置到第 0 帧。 */
    public void reset() {
        index.set(0);
    }
}
