package com.example.demo.common.logging.banner;

import java.io.PrintStream;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * 通用 Loading 动画工具 —— 任何长耗时操作都可以用一行代码获得旋转指示器。
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
        this.enabled = TerminalCapability.isTty() && out != null;
    }

    public static LoadingSpinner on()       { return new LoadingSpinner(System.out); }
    public static LoadingSpinner on(PrintStream out) { return new LoadingSpinner(out); }

    public static void run(String label, Runnable task)                             { on().execute(label, task); }
    public static <T> T supply(String label, Supplier<T> task)                      { return on().execute(label, task); }
    public static void progress(String label, int total, Consumer<Consumer<Integer>> task) { on().executeProgress(label, total, task); }

    public void execute(String label, Runnable task) {
        if (!enabled) { task.run(); return; }
        Thread animator = startSpin(label);
        long start = System.nanoTime();
        try { task.run(); } finally { stopAnimator(animator); printDone(label, start, true); }
    }

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

    public void executeProgress(String label, int total, Consumer<Consumer<Integer>> task) {
        if (!enabled) { task.accept(n -> {}); return; }
        AtomicInteger done = new AtomicInteger(0);
        Thread animator = startProgress(label, done, total);
        long start = System.nanoTime();
        try {
            task.accept(n -> { done.addAndGet(n); if (done.get() > total) done.set(total); });
        } finally { stopAnimator(animator); printDone(label, start, true); }
    }

    private Thread startSpin(String label) {
        Thread t = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                out.print("\r  " + GLOBAL_SPINNER.tick() + " " + label + " …");
                out.flush();
                try { Thread.sleep(FRAME_MS); } catch (InterruptedException e) { break; }
            }
        }, "spin-" + label);
        t.setDaemon(true); t.start();
        return t;
    }

    private Thread startProgress(String label, AtomicInteger done, int total) {
        Thread t = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                int d = done.get();
                String bar = ProgressBar.render(d, Math.max(total, d), null);
                out.print("\r  " + GLOBAL_SPINNER.tick() + " " + label + " " + bar);
                out.flush();
                try { Thread.sleep(FRAME_MS); } catch (InterruptedException e) { break; }
            }
        }, "prog-" + label);
        t.setDaemon(true); t.start();
        return t;
    }

    private void stopAnimator(Thread t) {
        t.interrupt();
        try { t.join(500); } catch (InterruptedException ignored) {}
    }

    private void printDone(String label, long startNanos, boolean success) {
        double elapsed = (System.nanoTime() - startNanos) / 1_000_000_000.0;
        String timeStr = elapsed >= 0.05 ? String.format(" (%.1fs)", elapsed) : "";
        String mark = success ? "✓" : "✗";
        out.print("\r" + " ".repeat(120) + "\r");
        out.println("  " + mark + " " + label + timeStr);
        out.flush();
    }
}
