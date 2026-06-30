package com.example.demo.common.logging.banner;

import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;

import java.io.PrintStream;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 赛博朋克启动动画引擎 —— Claude Code 风格实时终端动画。
 *
 * <p>后台线程以 80ms 帧率刷新旋转指示器 + 进度文本，
 * 使用 {@code \r} 回车覆盖当前行实现原地动画。
 */
public class StartupBanner {

    private static final long FRAME_MS = 80;

    private final PrintStream out;
    private String title;
    private String subtitle;
    private final List<PhaseDef> phases = new ArrayList<>();
    private final long startNanos;

    private StartupBanner(PrintStream out) {
        this.out = out;
        this.startNanos = System.nanoTime();
    }

    public static StartupBanner create(PrintStream out) {
        return new StartupBanner(out);
    }

    public StartupBanner title(String title) { this.title = title; return this; }
    public StartupBanner subtitle(String subtitle) { this.subtitle = subtitle; return this; }

    /** 注册并立即同步执行一个启动阶段。 */
    public StartupBanner phase(String name, String description, StartupRunner runner) {
        PhaseDef def = new PhaseDef(name, description, runner);
        phases.add(def);
        executePhase(def);
        return this;
    }

    /** 打印标题横幅 + 启动摘要框。 */
    public void finish(String port, String profile) {
        double elapsed = (System.nanoTime() - startNanos) / 1_000_000_000.0;

        // 标题横幅
        out.println();
        out.println(PhaseFrame.banner(title != null ? title : "TWIN SYSTEM", subtitle));
        out.println();

        // 最终状态
        for (PhaseDef def : phases) {
            switch (def.state) {
                case SUCCESS -> out.println(PhaseFrame.phaseLine(
                        PhaseState.SUCCESS, null, def.name, def.finalDetail));
                case FAILED -> out.println(PhaseFrame.phaseLine(
                        PhaseState.FAILED, null, def.name, def.finalDetail));
                case SKIPPED -> out.println(PhaseFrame.phaseLine(
                        PhaseState.SKIPPED, null, def.name, def.finalDetail));
            }
        }

        out.println();
        long failed = phases.stream().filter(p -> p.state == PhaseState.FAILED).count();
        boolean allOk = failed == 0;
        String line1 = "TWIN SYSTEM " + (allOk ? "READY" : "DEGRADED")
                + "  ·  :" + port + "  ·  " + String.format("%.1f", elapsed) + "s";
        String line2 = "http://localhost:5173  ·  profile: " + profile;
        if (!allOk) line2 += "  ·  " + failed + " phase(s) failed";
        out.println(PhaseFrame.resultBox(allOk, line1, line2));
        out.println();
    }

    // ─────────────────────────── internal ───────────────────────────

    private void executePhase(PhaseDef def) {
        // 共享状态：后台渲染线程读取
        AtomicReference<String> runningDetail = new AtomicReference<>("");
        AtomicInteger subtaskDone = new AtomicInteger(0);
        AtomicInteger subtaskTotal = new AtomicInteger(0);

        Spinner spinner = new Spinner();
        AtomicReference<Thread> animatorRef = new AtomicReference<>();
        animatorRef.set(startAnimator(def, spinner, runningDetail, subtaskDone, subtaskTotal));
        long phaseStart = System.nanoTime();

        StartupContext ctx = new StartupContext() {
            private Thread anim() { return animatorRef.get(); }

            @Override
            public void subtask(String label, Runnable task) {
                subtaskTotal.incrementAndGet();
                if (label != null) runningDetail.set(label);
                try {
                    task.run();
                } finally {
                    subtaskDone.incrementAndGet();
                    if (label != null) runningDetail.set(label);
                }
            }

            @Override
            public void progress(int current, int total, String detail) {
                subtaskDone.set(current);
                subtaskTotal.set(total);
                if (detail != null) runningDetail.set(detail);
            }

            @Override
            public void warn(String message) {
                // 暂停动画，打印警告，然后恢复
                Thread a = anim();
                if (a != null) { a.interrupt(); try { a.join(200); } catch (InterruptedException ignored) {} }
                out.print("\r" + " ".repeat(120) + "\r");
                out.println(CyberColor.AMBER + "  ! " + def.name + ": " + message + CyberColor.RESET);
                out.flush();
                animatorRef.set(startAnimator(def, spinner, runningDetail, subtaskDone, subtaskTotal));
            }
        };

        // 执行
        try {
            StartupResult result = def.runner.run(ctx);
            def.state = result.success() ? PhaseState.SUCCESS : PhaseState.FAILED;

            double elapsed = (System.nanoTime() - phaseStart) / 1_000_000_000.0;
            String detail = result.summary() != null ? result.summary() : "";
            if (elapsed >= 0.05) {
                detail += (detail.isEmpty() ? "" : " ") + String.format("(%.1fs)", elapsed);
            }
            def.finalDetail = detail;
            if (!result.success() && result.error() != null) {
                def.finalDetail = detail + " — " + truncate(result.error().getMessage(), 50);
            }
        } catch (Exception e) {
            def.state = PhaseState.FAILED;
            def.finalDetail = truncate(e.getMessage(), 60);
        } finally {
            // 停止动画线程
            Thread a = animatorRef.get();
            if (a != null) { a.interrupt(); try { a.join(500); } catch (InterruptedException ignored) {} }
        }

        // 打印最终行
        out.print("\r" + " ".repeat(120) + "\r"); // 清行
        if (def.state == PhaseState.SUCCESS) {
            out.println(PhaseFrame.phaseLine(PhaseState.SUCCESS, null, def.name, def.finalDetail));
        } else {
            out.println(PhaseFrame.phaseLine(PhaseState.FAILED, null, def.name, def.finalDetail));
        }
    }

    /** 启动后台动画线程 */
    private Thread startAnimator(PhaseDef def, Spinner spinner,
                                  AtomicReference<String> detail,
                                  AtomicInteger done, AtomicInteger total) {
        Thread t = new Thread(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                String frame = spinner.tick();
                String detailText = detail.get();
                int d = done.get(), ttl = total.get();

                StringBuilder line = new StringBuilder();
                line.append('\r').append(PhaseFrame.phaseLine(
                        PhaseState.RUNNING, frame, def.name, detailText));

                // 附加进度条（若有 subtask）
                if (ttl > 0) {
                    line.append(' ').append(ProgressBar.render(d, ttl, null));
                }

                // 清到行尾
                out.print(line.toString());
                out.flush();

                try { Thread.sleep(FRAME_MS); } catch (InterruptedException e) { break; }
            }
        }, "banner-" + def.name);
        t.setDaemon(true);
        t.start();
        return t;
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen - 3) + "...";
    }

    // ─────────────────────────── data class ───────────────────────────

    static class PhaseDef {
        final String name;
        final String description;
        final StartupRunner runner;
        volatile PhaseState state = PhaseState.RUNNING;
        volatile String finalDetail = "";

        PhaseDef(String name, String description, StartupRunner runner) {
            this.name = name;
            this.description = description;
            this.runner = runner;
        }
    }
}
