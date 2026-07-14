package com.example.demo.common.logging.banner;

import java.io.PrintStream;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 粘性底部状态栏 —— ANSI 转义码实现，模拟 Claude Code 终端 UI。
 *
 * <p>用法：
 * <pre>{@code
 * StickyFooter footer = StickyFooter.install(System.out, SpinnerStyle.DOTS);
 * footer.tick("数据库迁移 (" + done + "/" + total + ")");
 * footer.shutdown("✓ 全部就绪 (2.3s)");
 * }</pre>
 *
 * <p>原理：拦截 System.out，每条输出前先擦除底部栏→输出→重绘底部栏。
 * 后台线程 80ms 刷新旋转指示器帧。
 */
public class StickyFooter {

    private static final String CSI = "\033[";

    private final PrintStream originalOut;
    private final AtomicReference<String> content = new AtomicReference<>("");
    private final AtomicReference<Spinner> spinner;
    private volatile boolean active = true;
    private volatile boolean installed = false;

    private StickyFooter(PrintStream originalOut, Spinner spinner) {
        this.originalOut = originalOut;
        this.spinner = new AtomicReference<>(spinner);
    }

    /** 安装粘性底部栏（默认 CLASSIC spinner）。 */
    public static StickyFooter install(PrintStream realOut) {
        return install(realOut, Spinner.SpinnerStyle.CLASSIC);
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

    public void shutdown(String finalText) {
        active = false;
        if (installed) {
            originalOut.print(CSI + "1G" + CSI + "K");
            originalOut.println(finalText);
        } else {
            originalOut.print("\r" + " ".repeat(120) + "\r");
            originalOut.println(finalText);
        }
    }

    private void render() {
        if (!active || !installed) return;
        String text = content.get();
        if (text.isEmpty()) return;
        originalOut.print(CSI + "s");
        originalOut.print(CSI + "1G");
        originalOut.print(CSI + "K");
        originalOut.print(CyberColor.MAGENTA + text + CyberColor.RESET);
        originalOut.print(CSI + "u");
        originalOut.flush();
    }
}
