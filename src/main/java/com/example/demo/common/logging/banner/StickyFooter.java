package com.example.demo.common.logging.banner;

import java.io.PrintStream;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 粘性底部状态栏 —— ANSI 转义码实现，模拟 Claude Code 终端 UI。
 *
 * <p>旋转指示器自动颜色循环（绿→青→品红→琥珀），视觉突出。
 *
 * <p>用法：
 * <pre>{@code
 * StickyFooter footer = StickyFooter.install(System.out, SpinnerStyle.SHUTTLE);
 * footer.tick("数据库迁移 (" + done + "/" + total + ")");
 * footer.shutdown("✓ 全部就绪 (2.3s)");
 * }</pre>
 *
 * <p>原理：拦截 System.out，每条输出前先擦除底部栏→输出→重绘底部栏。
 * 后台线程 80ms 刷新旋转指示器帧。
 */
public class StickyFooter {

    private static final String CSI = "\033[";

    /** 颜色循环表（与 spinner 帧无关，按时间轮转） */
    private static final String[] COLOR_CYCLE = {
        CyberColor.CYAN, CyberColor.MAGENTA, CyberColor.AMBER, CyberColor.GREEN
    };

    private final PrintStream originalOut;
    private final AtomicReference<String> content = new AtomicReference<>("");
    private final AtomicReference<Spinner> spinner;
    private volatile boolean active = true;
    private volatile boolean installed = false;
    private volatile int colorTick = 0;

    private StickyFooter(PrintStream originalOut, Spinner spinner) {
        this.originalOut = originalOut;
        this.spinner = new AtomicReference<>(spinner);
    }

    /** 安装粘性底部栏（默认 SHUTTLE spinner）。 */
    public static StickyFooter install(PrintStream realOut) {
        return install(realOut, Spinner.SpinnerStyle.SHUTTLE);
    }

    /** 安装粘性底部栏（指定 spinner 方案）。 */
    public static StickyFooter install(PrintStream realOut, Spinner.SpinnerStyle spinnerStyle) {
        if (!CyberColor.isTty()) {
            StickyFooter f = new StickyFooter(realOut, new Spinner(spinnerStyle));
            f.installed = false;
            return f;
        }
        StickyFooter footer = new StickyFooter(realOut, new Spinner(spinnerStyle));
        realOut.println();
        PrintStream wrapper = new PrintStream(realOut) {
            private StringBuilder buf = new StringBuilder();

            @Override
            public void write(int b) {
                if (!footer.active) { realOut.write(b); return; }
                char c = (char) b;
                if (c == '\n') {
                    flushLine(buf.toString());
                    buf.setLength(0);
                } else {
                    buf.append(c);
                }
            }

            @Override
            public void write(byte[] bytes, int off, int len) {
                if (!footer.active) { realOut.write(bytes, off, len); return; }
                for (int i = off; i < off + len; i++) {
                    write(bytes[i]);
                }
            }

            private void flushLine(String line) {
                realOut.print(CSI + "1G");
                realOut.print(CSI + "K");
                realOut.print(line);
                realOut.print('\n');
                footer.render();
            }

            @Override
            public void flush() { realOut.flush(); }
            @Override
            public void close() { /* don't close realOut */ }
        };
        System.setOut(wrapper);
        footer.installed = true;

        Thread refresher = new Thread(() -> {
            while (footer.active) {
                footer.colorTick++;
                footer.render();
                try { Thread.sleep(80); } catch (InterruptedException e) { break; }
            }
        }, "sticky-footer");
        refresher.setDaemon(true);
        refresher.start();

        return footer;
    }

    public void update(String text) {
        content.set(text);
        if (!installed) {
            originalOut.print("\r" + text);
            originalOut.flush();
        }
    }

    public void tick(String text) {
        Spinner s = spinner.get();
        update(s.tick() + " " + text);
    }

    /** 关闭底部栏，清空残留帧，输出最终状态。 */
    public void shutdown(String finalText) {
        active = false;
        content.set(""); // 阻止 render 重绘
        if (installed) {
            // 擦除底部行 → 回退一行 → 再清一次（确保无残留）
            originalOut.print(CSI + "1G" + CSI + "K");
            originalOut.print(finalText.isEmpty() ? "" : finalText + "\n");
        } else {
            originalOut.print("\r" + " ".repeat(120) + "\r");
            if (!finalText.isEmpty()) originalOut.println(finalText);
        }
        originalOut.flush();
    }

    private void render() {
        if (!active || !installed) return;
        String text = content.get();
        if (text.isEmpty()) return;
        // 颜色循环：每 6 个刷新节拍切换一次颜色
        String spinnerColor = COLOR_CYCLE[(colorTick / 6) % COLOR_CYCLE.length];
        originalOut.print(CSI + "s");
        originalOut.print(CSI + "1G");
        originalOut.print(CSI + "K");
        originalOut.print(spinnerColor + text + CyberColor.RESET);
        originalOut.print(CSI + "u");
        originalOut.flush();
    }
}
