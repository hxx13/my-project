package com.example.demo.common.logging.banner;

import java.io.PrintStream;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 粘性底部状态栏 —— ANSI 转义码实现，模拟 Claude Code 终端 UI。
 *
 * <p>用法：
 * <pre>{@code
 * StickyFooter footer = StickyFooter.install(System.out);
 * footer.update("⠋ 数据库迁移 [████░░░░░░] 40% (12/30)");
 * // ... 正常 log 输出（自动推到状态栏上方）...
 * footer.update("⠹ 数据库迁移 [████████░░] 80% (24/30)");
 * footer.shutdown("✓ 全部就绪 (2.3s)");
 * }</pre>
 *
 * <p>原理：拦截 System.out，每条输出前先擦除底部栏→输出→重绘底部栏。
 * 后台线程 80ms 刷新旋转指示器帧。
 */
public class StickyFooter {

    private static final String CSI = "["; // ESC [

    private final PrintStream originalOut;
    private final AtomicReference<String> content = new AtomicReference<>("");
    private final AtomicReference<Spinner> spinner = new AtomicReference<>(new Spinner());
    private volatile boolean active = true;
    private volatile boolean installed = false;

    private StickyFooter(PrintStream originalOut) {
        this.originalOut = originalOut;
    }

    /**
     * 安装粘性底部栏，拦截 System.out。
     * 返回的实例用于更新内容和最终关闭。
     */
    public static StickyFooter install(PrintStream realOut) {
        if (!CyberColor.isTty()) {
            // 非 TTY：不拦截，用简易模式
            StickyFooter f = new StickyFooter(realOut);
            f.installed = false;
            return f;
        }
        StickyFooter footer = new StickyFooter(realOut);
        // 预留底部 1 行
        realOut.println();
        // 包装 System.out
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
                // 擦除当前底部栏
                realOut.print(CSI + "1G"); // 移到行首
                realOut.print(CSI + "K");  // 清除到行尾
                // 输出日志行
                realOut.print(line);
                realOut.print('\n');
                // 重绘底部栏
                footer.render();
            }

            @Override
            public void flush() { realOut.flush(); }
            @Override
            public void close() { /* don't close realOut */ }
        };
        System.setOut(wrapper);
        footer.installed = true;

        // 后台刷新线程：更新旋转指示器
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

    /** 更新底部栏内容。 */
    public void update(String text) {
        content.set(text);
        if (!installed) {
            // 非 TTY 简易模式：直接 \r 刷新
            originalOut.print("\r" + text);
            originalOut.flush();
        }
    }

    /** 更新底部栏内容（含旋转指示器）。 */
    public void tick(String text) {
        Spinner s = spinner.get();
        update(s.tick() + " " + text);
    }

    /** 关闭底部栏，输出最终状态。 */
    public void shutdown(String finalText) {
        active = false;
        if (installed) {
            // 恢复原始 System.out
            // 擦除底部栏
            originalOut.print(CSI + "1G" + CSI + "K");
            // 打印最终状态
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
        // ANSI: 保存光标 → 移到底部行首 → 清行 → 打印 → 恢复光标
        originalOut.print(CSI + "s");           // save cursor
        originalOut.print(CSI + "1G");          // column 1
        originalOut.print(CSI + "K");           // clear line
        originalOut.print(CyberColor.MAGENTA + text + CyberColor.RESET);
        originalOut.print(CSI + "u");           // restore cursor
        originalOut.flush();
    }
}
