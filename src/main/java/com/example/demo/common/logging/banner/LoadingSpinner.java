package com.example.demo.common.logging.banner;

import java.io.PrintStream;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * 通用 Loading 动画工具 —— 任何长耗时操作都可以用一行代码获得旋转指示器。
 *
 * <h3>快速使用</h3>
 * <pre>{@code
 * // 1. 最简单：包裹一个 Runnable
 * LoadingSpinner.run("加载人脸模型", () -> faceService.init());
 *
 * // 2. 带返回值
 * String token = LoadingSpinner.supply("获取ARO Token", () -> aroService.login());
 *
 * // 3. 带进度条（可计数场景）
 * LoadingSpinner.progress("WinCC测量", 680, tick -> {
 *     for (int i = 0; i < 5; i++) {
 *         fetchBatch();
 *         tick.accept(150); // 这批拉了 150 个点
 *     }
 * });
 *
 * // 4. 自定义输出流
 * LoadingSpinner.on(System.err).run("数据库迁移", () -> migrate());
 * }</pre>
 *
 * <p>输出到 stderr，使用 {@code \r} 原地刷新。非 TTY 环境自动静默（不显示动画）。
 */
public final class LoadingSpinner {

    private static final long FRAME_MS = 80;
    private static final Spinner GLOBAL_SPINNER = new Spinner();

    private final PrintStream out;
    private final boolean enabled;

    private LoadingSpinner(PrintStream out) {
        this.out = out;
        this.enabled = CyberColor.isTty() && out != null;
    }

    /** 使用默认输出流 (stderr) 创建。 */
    public static LoadingSpinner on() {
        return new LoadingSpinner(System.err);
    }

    /** 使用指定输出流创建。 */
    public static LoadingSpinner on(PrintStream out) {
        return new LoadingSpinner(out);
    }

    // ─── 静态快捷方法 (默认 stderr) ───

    /** 执行 Runnable，期间显示旋转指示器 + 标签。 */
    public static void run(String label, Runnable task) {
        on().execute(label, task);
    }

    /** 执行 Supplier，返回结果，期间显示旋转指示器 + 标签。 */
    public static <T> T supply(String label, Supplier<T> task) {
        return on().execute(label, task);
    }

    /**
     * 执行一个可计数的任务，显示进度条。
     * @param label  任务名称
     * @param total  预计总数
     * @param task   接收 tick 回调：每完成一批就调用 tick.accept(n)
     */
    public static void progress(String label, int total, Consumer<Consumer<Integer>> task) {
        on().executeProgress(label, total, task);
    }

    // ─── 实例方法 ───

    /** 执行 Runnable，显示旋转指示器。 */
    public void execute(String label, Runnable task) {
        if (!enabled) { task.run(); return; }
        Thread animator = startSpin(label);
        long start = System.nanoTime();
        try {
            task.run();
        } finally {
            stopAnimator(animator);
            printDone(label, start, true);
        }
    }

    /** 执行 Supplier，显示旋转指示器，返回结果。 */
    public <T> T execute(String label, Supplier<T> task) {
        if (!enabled) return task.get();
        Thread animator = startSpin(label);
        long start = System.nanoTime();
        try {
            T result = task.get();
            stopAnimator(animator);
            printDone(label, start, true);
            return result;
        } catch (Exception e) {
            stopAnimator(animator);
            printDone(label, start, false);
            throw e;
        }
    }

    /** 执行可计数任务，显示进度条。 */
    public void executeProgress(String label, int total, Consumer<Consumer<Integer>> task) {
        if (!enabled) { task.accept(n -> {}); return; }
        AtomicInteger done = new AtomicInteger(0);
        Thread animator = startProgress(label, done, total);
        long start = System.nanoTime();
        try {
            task.accept(n -> {
                done.addAndGet(n);
                if (done.get() > total) done.set(total);
            });
        } finally {
            stopAnimator(animator);
            printDone(label, start, true);
        }
    }

    // ─── internal ───

    private Thread startSpin(String label) {
        Thread t = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                String frame = GLOBAL_SPINNER.tick();
                out.print("\r  " + CyberColor.MAGENTA + frame + CyberColor.RESET
                        + " " + CyberColor.WHITE + label + CyberColor.RESET + " …");
                out.flush();
                try { Thread.sleep(FRAME_MS); } catch (InterruptedException e) { break; }
            }
        }, "spin-" + label);
        t.setDaemon(true);
        t.start();
        return t;
    }

    private Thread startProgress(String label, AtomicInteger done, int total) {
        Thread t = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                String frame = GLOBAL_SPINNER.tick();
                int d = done.get();
                int ttl = Math.max(total, d);
                String bar = ProgressBar.render(d, ttl, null);
                out.print("\r  " + CyberColor.MAGENTA + frame + CyberColor.RESET
                        + " " + CyberColor.WHITE + label + CyberColor.RESET
                        + " " + bar);
                out.flush();
                try { Thread.sleep(FRAME_MS); } catch (InterruptedException e) { break; }
            }
        }, "prog-" + label);
        t.setDaemon(true);
        t.start();
        return t;
    }

    private void stopAnimator(Thread t) {
        t.interrupt();
        try { t.join(500); } catch (InterruptedException ignored) {}
    }

    private void printDone(String label, long startNanos, boolean success) {
        double elapsed = (System.nanoTime() - startNanos) / 1_000_000_000.0;
        String timeStr = elapsed >= 0.05 ? String.format(" (%.1fs)", elapsed) : "";
        String mark = success
                ? CyberColor.GREEN + "✓" + CyberColor.RESET
                : CyberColor.RED + "✗" + CyberColor.RESET;
        out.print("\r" + " ".repeat(120) + "\r");
        out.println("  " + mark + " "
                + CyberColor.WHITE + label + CyberColor.RESET
                + CyberColor.GRAY + timeStr + CyberColor.RESET);
        out.flush();
    }
}
