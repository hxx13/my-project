package com.example.demo.common.logging.banner;

import com.example.demo.common.logging.model.PhaseResult;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;

import java.io.PrintStream;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * 赛博朋克启动动画引擎。
 *
 * <h3>使用方式</h3>
 * <pre>{@code
 * StartupBanner banner = StartupBanner.create(System.err)
 *     .title("🧬 TWIN SYSTEM v2.0")
 *     .subtitle("Neuro-Synced Infrastructure");
 *
 * banner.phase("数据库迁移", "28 个 DDL 脚本", ctx -> {
 *     ctx.subtask("login-branding", () -> runScript("..."));
 *     // ...
 *     return StartupResult.success("28/28 就绪");
 * });
 *
 * banner.finish(":8081", "local");
 * }</pre>
 */
public class StartupBanner {

    private final PrintStream out;
    private String title;
    private String subtitle;
    private final List<PhaseDef> phases = new ArrayList<>();
    private final long startNanos;
    private boolean finished = false;

    private StartupBanner(PrintStream out) {
        this.out = out;
        this.startNanos = System.nanoTime();
    }

    public static StartupBanner create(PrintStream out) {
        return new StartupBanner(out);
    }

    public StartupBanner title(String title) {
        this.title = title;
        return this;
    }

    public StartupBanner subtitle(String subtitle) {
        this.subtitle = subtitle;
        return this;
    }

    /**
     * 注册并立即同步执行一个启动阶段。
     */
    public StartupBanner phase(String name, String description, StartupRunner runner) {
        PhaseDef def = new PhaseDef(name, description, runner);
        phases.add(def);
        executePhase(def);
        return this;
    }

    /**
     * 注册一个阶段但不立即执行（延迟到 {@link #runAll()} 时批量执行）。
     */
    public StartupBanner register(String name, String description, StartupRunner runner) {
        phases.add(new PhaseDef(name, description, runner));
        return this;
    }

    /**
     * 批量执行所有已注册的阶段。
     */
    public void runAll() {
        for (PhaseDef def : phases) {
            if (!def.executed) {
                executePhase(def);
            }
        }
    }

    /**
     * 打印标题横幅 + 启动摘要框，标记启动完成。
     */
    public void finish(String port, String profile) {
        finished = true;
        double elapsed = (System.nanoTime() - startNanos) / 1_000_000_000.0;

        // 标题横幅
        if (title != null) {
            out.println();
            out.println(PhaseFrame.banner(title, subtitle));
            out.println();
        }

        // 重放所有已完成阶段的最终状态
        for (PhaseDef def : phases) {
            if (def.state == PhaseState.SUCCESS) {
                out.println(PhaseFrame.phaseLine(PhaseState.SUCCESS, null, def.name, def.finalDetail));
            } else if (def.state == PhaseState.FAILED) {
                out.println(PhaseFrame.phaseLine(PhaseState.FAILED, null, def.name, def.finalDetail));
            } else if (def.state == PhaseState.SKIPPED) {
                out.println(PhaseFrame.phaseLine(PhaseState.SKIPPED, null, def.name, def.finalDetail));
            }
        }

        // 结果框
        out.println();
        long failedCount = phases.stream().filter(p -> p.state == PhaseState.FAILED).count();
        boolean allOk = failedCount == 0;
        String line1 = "TWIN SYSTEM " + (allOk ? "READY" : "DEGRADED")
                + "  ·  :" + port + "  ·  " + String.format("%.1f", elapsed) + "s";
        String line2 = "http://localhost:5173  ·  profile: " + profile;
        if (!allOk) {
            line2 += "  ·  " + failedCount + " phase(s) failed";
        }
        out.println(PhaseFrame.resultBox(allOk, line1, line2));
        out.println();
    }

    // --- internal ---

    private void executePhase(PhaseDef def) {
        def.executed = true;
        Spinner spinner = new Spinner();
        AtomicInteger subtaskCurrent = new AtomicInteger(0);
        AtomicInteger subtaskTotal = new AtomicInteger(0);
        long phaseStart = System.nanoTime();

        // 构建上下文
        StartupContext ctx = new StartupContext() {
            @Override
            public void subtask(String label, Runnable task) {
                subtaskTotal.incrementAndGet();
                if (label != null) {
                    renderRunning(def, spinner, label);
                }
                try {
                    task.run();
                } finally {
                    subtaskCurrent.incrementAndGet();
                }
            }

            @Override
            public void progress(int current, int total, String detail) {
                subtaskCurrent.set(current);
                subtaskTotal.set(total);
                renderRunning(def, spinner, detail);
            }

            @Override
            public void warn(String message) {
                if (!finished) {
                    out.println(CyberColor.AMBER + "  ! " + def.name + ": " + message + CyberColor.RESET);
                }
            }
        };

        // 执行
        def.state = PhaseState.RUNNING;
        try {
            StartupResult result = def.runner.run(ctx);
            def.state = result.success() ? PhaseState.SUCCESS : PhaseState.FAILED;

            double elapsed = (System.nanoTime() - phaseStart) / 1_000_000_000.0;
            String detail = result.summary() != null ? result.summary() : "";
            if (elapsed >= 0.05) {
                detail += (detail.isEmpty() ? "" : " ") + String.format("(%.1fs)", elapsed);
            }
            def.finalDetail = detail;

            if (result.success() && !finished) {
                // 不在 finish 中——立即打印完成行
                out.println(PhaseFrame.phaseLine(PhaseState.SUCCESS, null, def.name, def.finalDetail));
            } else if (!result.success()) {
                String errDetail = def.finalDetail;
                if (result.error() != null) {
                    String msg = result.error().getMessage();
                    if (msg != null && !msg.isBlank()) {
                        errDetail = truncate(msg, 60);
                    }
                }
                out.println(PhaseFrame.phaseLine(PhaseState.FAILED, null, def.name, errDetail));
                if (result.error() != null) {
                    out.println(CyberColor.RED + "       " + result.error().getClass().getSimpleName()
                            + ": " + result.error().getMessage() + CyberColor.RESET);
                }
            }
        } catch (Exception e) {
            def.state = PhaseState.FAILED;
            def.finalDetail = truncate(e.getMessage(), 60);
            out.println(PhaseFrame.phaseLine(PhaseState.FAILED, null, def.name, def.finalDetail));
            out.println(CyberColor.RED + "       " + e.getClass().getSimpleName()
                    + ": " + e.getMessage() + CyberColor.RESET);
        }
    }

    private void renderRunning(PhaseDef def, Spinner spinner, String detail) {
        if (finished) return;
        // 回车覆盖当前行（动画中）
        out.print("\r" + PhaseFrame.phaseLine(PhaseState.RUNNING, spinner.tick(), def.name, detail));
        out.flush();
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen - 3) + "...";
    }

    // --- data class ---

    static class PhaseDef {
        final String name;
        final String description;
        final StartupRunner runner;
        PhaseState state = PhaseState.RUNNING;
        String finalDetail = "";
        boolean executed = false;

        PhaseDef(String name, String description, StartupRunner runner) {
            this.name = name;
            this.description = description;
            this.runner = runner;
        }
    }
}
