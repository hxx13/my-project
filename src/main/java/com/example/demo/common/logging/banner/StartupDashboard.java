package com.example.demo.common.logging.banner;

import java.io.PrintStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 启动仪表盘 —— 单行原地刷新的实时状态 + 逐行落定的阶段记录。
 *
 * <p>只用 {@code \r} + {@code ESC[2K} 重画光标所在的那一行。不用光标上移
 * （{@code ESC[nA}）—— IntelliJ Run 控制台会把它整段吃掉，多行区域于是每帧
 * 被追加而不是覆盖，屏幕上堆出一串重复块。
 *
 * <p>当前阶段在本行原地刷新（旋转符 + 进度条 + 明细），阶段结束后清掉该行并
 * {@code println} 一条永久记录，逐条向上滚动。整场输出永远只有一行是"活的"。
 *
 * <p>非 TTY / 无 ANSI / 设了 {@code NO_COLOR} 时降级为逐行纯文本，不输出转义序列。
 */
public final class StartupDashboard {

    private static final long FRAME_MS = 50;
    private static final int NAME_W = 18;
    private static final int BAR_W = 22;
    private static final int ROW_W = 100;
    private static final int SUB = 8;
    private static final int PREFIX_W = 2 + 1 + 1 + NAME_W + 1 + (BAR_W + 2) + 1 + 4 + 2;

    private static final boolean UNI = TerminalCapability.hasUnicode();
    private static final char FILL = UNI ? '█' : '#';
    private static final char EMPTY = UNI ? '░' : '.';
    private static final char[] SUB_BLOCKS = {' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉'};

    private enum State { PENDING, RUNNING, OK, FAIL }

    /** 仪表盘上的一行；写入在业务线程、读取在绘制线程，故字段 volatile。 */
    public static final class Row {
        private final String name;
        private volatile State state = State.PENDING;
        private volatile int done, total;
        private volatile String detail = "";
        private volatile String summary = "";

        private Row(String name) { this.name = name; }
    }

    private final PrintStream out;
    private final boolean live;
    private final Spinner spinner;
    private final List<Row> rows = new ArrayList<>();
    private final long t0 = System.nanoTime();
    private final AtomicInteger frame = new AtomicInteger();

    private volatile boolean animating;
    private Thread painter;

    public StartupDashboard(PrintStream out, Spinner.SpinnerStyle style) {
        this.out = out;
        // NO_COLOR 是终端通用逃生开关：置上即退回逐行纯文本
        this.live = TerminalCapability.isTty() && TerminalCapability.hasAnsi()
                && System.getenv("NO_COLOR") == null;
        this.spinner = new Spinner(style);
    }

    /** 预声明一行（PENDING 态）。 */
    public Row declare(String name) {
        Row r = new Row(name);
        rows.add(r);
        return r;
    }

    public double elapsedSeconds() { return (System.nanoTime() - t0) / 1_000_000_000.0; }

    public boolean isLive() { return live; }

    /** 启动绘制线程。 */
    public void open() {
        if (!live) return;
        out.print("\033[?25l");          // 藏光标，免得在刷新行上跳
        out.flush();
        animating = true;
        painter = new Thread(this::loop, "startup-dashboard");
        painter.setDaemon(true);
        painter.start();
    }

    /** 停止绘制、清掉实时行、恢复光标。 */
    public void close() {
        animating = false;
        Thread p = painter;
        if (p != null) {
            p.interrupt();
            try { p.join(400); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }
        if (!live) return;
        out.print("\r\033[2K\033[?25h");
        out.flush();
    }

    public void begin(Row r) {
        r.state = State.RUNNING;
    }

    public void progress(Row r, int done, int total, String detail) {
        r.done = done;
        r.total = total;
        if (detail != null && !detail.isEmpty()) r.detail = detail;
    }

    /** 阶段结束：清掉实时行，落一条永久记录。 */
    public synchronized void complete(Row r, boolean ok, String summary) {
        r.state = ok ? State.OK : State.FAIL;
        r.summary = summary == null ? "" : summary;
        r.total = Math.max(r.total, 1);
        if (ok) r.done = Math.max(r.done, r.total);

        if (!live) {
            out.println(plainLine(r));
            return;
        }
        out.print("\r\033[2K");
        out.println(rowLine(r, frame.getAndIncrement()));
        out.flush();
    }

    /** 在实时行上方落一条永久输出（警告等）。 */
    public synchronized void note(String line) {
        if (!live) { out.println(line); out.flush(); return; }
        out.print("\r\033[2K");
        out.println(line);
        out.flush();
    }

    // ─────────────────────────── 绘制 ───────────────────────────

    private void loop() {
        while (animating) {
            repaint();
            try { Thread.sleep(FRAME_MS); } catch (InterruptedException e) { return; }
        }
    }

    /** 整场只重画这一行：回到行首、清行、写新内容，光标原地不动。 */
    private synchronized void repaint() {
        if (!live) return;
        Row active = null;
        for (Row r : rows) {
            if (r.state == State.RUNNING) { active = r; break; }
        }
        out.print("\r\033[2K");
        if (active != null) out.print(rowLine(active, frame.getAndIncrement()));
        out.flush();
    }

    private String rowLine(Row r, int f) {
        String glyph, color;
        switch (r.state) {
            case RUNNING -> { glyph = r.total > 0 ? spinner.tick() : spinner.current(); color = CyberColor.CYAN; }
            case OK -> { glyph = "✓"; color = CyberColor.GREEN; }
            case FAIL -> { glyph = "✗"; color = CyberColor.RED; }
            default -> { glyph = "·"; color = CyberColor.GRAY; }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("  ").append(color).append(glyph).append(CyberColor.RESET).append(' ');
        sb.append(CyberColor.BOLD).append(pad(r.name, NAME_W)).append(CyberColor.RESET);
        sb.append(' ').append(bar(r, f)).append(' ');

        int pct = r.total > 0 ? (int) ((long) r.done * 100 / r.total) : 0;
        sb.append(CyberColor.GRAY).append(String.format("%3d%%", pct)).append(CyberColor.RESET).append("  ");

        String text = r.state == State.RUNNING ? r.detail : r.summary;
        if (!text.isEmpty()) {
            sb.append(CyberColor.GRAY).append(clip(text, ROW_W - PREFIX_W)).append(CyberColor.RESET);
        }
        return sb.toString();
    }

    /** 定长进度条；total 未知时走彗星扫掠，避免长时间无进度时画面发死。 */
    private String bar(Row r, int f) {
        String fill = switch (r.state) {
            case OK -> CyberColor.GREEN;
            case FAIL -> CyberColor.RED;
            default -> CyberColor.CYAN;
        };
        StringBuilder sb = new StringBuilder(CyberColor.GRAY + "[" + CyberColor.RESET);

        if (r.total <= 0) {
            int head = f % (BAR_W + 8);
            for (int i = 0; i < BAR_W; i++) {
                int d = head - i;
                if (d < 0 || d > 5) {
                    sb.append(CyberColor.GRAY).append(EMPTY);
                } else if (d == 0) {
                    sb.append(CyberColor.BOLD).append(CyberColor.WHITE).append(FILL);
                } else if (d == 1) {
                    sb.append(CyberColor.WHITE).append(UNI ? '▓' : '#');
                } else if (d == 2) {
                    sb.append(fill).append(UNI ? '▒' : '#');
                } else {
                    sb.append(CyberColor.GRAY).append(EMPTY);
                }
                sb.append(CyberColor.RESET);
            }
        } else {
            int units = (int) ((long) r.done * BAR_W * SUB / r.total);
            int full = Math.min(BAR_W, units / SUB);
            int rem = units % SUB;
            int sheen = full > 0 ? (f / 2) % full : -1;   // 亮带在已填充段内扫掠
            boolean anim = r.state == State.RUNNING;

            for (int i = 0; i < BAR_W; i++) {
                if (i < full) {
                    sb.append(anim && i == sheen ? CyberColor.BOLD + CyberColor.WHITE : fill).append(FILL);
                } else if (i == full && rem > 0) {
                    sb.append(fill).append(UNI ? SUB_BLOCKS[rem] : '#');
                } else {
                    sb.append(CyberColor.GRAY).append(EMPTY);
                }
                sb.append(CyberColor.RESET);
            }
        }
        return sb.append(CyberColor.GRAY).append(']').append(CyberColor.RESET).toString();
    }

    private static String plainLine(Row r) {
        StringBuilder sb = new StringBuilder("  ");
        sb.append(r.state == State.FAIL ? "✗ " : "✓ ").append(r.name);
        if (r.total > 1) sb.append("  ").append(r.done).append('/').append(r.total);
        if (!r.summary.isEmpty()) sb.append("  ").append(r.summary);
        return sb.toString();
    }

    // ─────────────────────────── 文本宽度 ───────────────────────────

    /** 右补齐到指定可见列宽（CJK 按 2 列、忽略 ANSI 转义）。 */
    static String pad(String s, int width) {
        int w = visWidth(s);
        return w >= width ? s : s + " ".repeat(width - w);
    }

    /** 按可见列宽裁剪，超出部分省略为 …。 */
    static String clip(String s, int maxCols) {
        if (visWidth(s) <= maxCols) return s;
        StringBuilder sb = new StringBuilder();
        int w = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int cw = isWide(c) ? 2 : 1;
            if (w + cw > maxCols - 1) break;
            sb.append(c);
            w += cw;
        }
        return sb.append('…').toString();
    }

    static int visWidth(String s) {
        int w = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\033') {
                while (i < s.length() && s.charAt(i) != 'm') i++;
                continue;
            }
            w += isWide(c) ? 2 : 1;
        }
        return w;
    }

    private static boolean isWide(char c) {
        return (c >= 0x1100 && c <= 0x115F)
                || (c >= 0x2E80 && c <= 0xA4CF)
                || (c >= 0xAC00 && c <= 0xD7A3)
                || (c >= 0xF900 && c <= 0xFAFF)
                || (c >= 0xFE30 && c <= 0xFE6F)
                || (c >= 0xFF00 && c <= 0xFF60)
                || (c >= 0xFFE0 && c <= 0xFFE6);
    }
}
