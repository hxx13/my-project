package com.example.demo.common.logging.config;

import com.example.demo.common.logging.annotation.LogCategoryAnno;
import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.banner.*;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import com.example.demo.common.logging.registry.LogCategoryRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 启动阶段编排器 — 粘性底部状态栏 + 赛博朋克动画。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class StartupPhaseRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupPhaseRunner.class);

    private final ApplicationContext ctx;

    @Value("${server.port:8080}")
    private int port;

    @Value("${spring.profiles.active:local}")
    private String profile;

    @Value("${twin.app.version:2.0}")
    private String appVersion;

    public StartupPhaseRunner(ApplicationContext ctx) {
        this.ctx = ctx;
    }

    @Override
    public void run(ApplicationArguments args) {
        scanLogCategories();

        Map<String, Object> phaseBeans = ctx.getBeansWithAnnotation(StartupPhase.class);
        if (phaseBeans.isEmpty()) {
            log.info("No @StartupPhase beans found — banner skipped");
            return;
        }

        List<PhaseEntry> entries = new ArrayList<>();
        for (Object bean : phaseBeans.values()) {
            if (!(bean instanceof StartupRunner runner)) continue;
            StartupPhase ann = bean.getClass().getAnnotation(StartupPhase.class);
            entries.add(new PhaseEntry(ann.name(), ann.order(), ann.description(), ann.subtasks(), runner));
        }
        entries.sort(Comparator.comparingInt(PhaseEntry::order));

        // ── 安装粘性底部状态栏 ──
        StickyFooter footer = StickyFooter.install(System.out);
        List<String> completed = new ArrayList<>();

        for (PhaseEntry entry : entries) {
            // 重置 footer 内容为该阶段
            footer.update(""); // 清空
            AtomicInteger done = new AtomicInteger(0);
            AtomicInteger total = new AtomicInteger(0);
            long phaseStart = System.nanoTime();

            // 构建上下文 — subtask 回调更新 footer
            StartupContext phaseCtx = new StartupContext() {
                @Override
                public void subtask(String label, Runnable task) {
                    total.incrementAndGet();
                    if (label != null) {
                        footer.tick(entry.name + "  ·  " + label
                                + (total.get() > 0 ? "  (" + done.get() + "/" + total.get() + ")" : ""));
                    }
                    try {
                        task.run();
                    } finally {
                        done.incrementAndGet();
                        if (label != null) {
                            footer.tick(entry.name + "  ·  " + label
                                    + "  (" + done.get() + "/" + total.get() + ")");
                        }
                    }
                }

                @Override
                public void progress(int current, int totalVal, String detail) {
                    done.set(current);
                    total.set(totalVal);
                    if (detail != null) {
                        footer.tick(entry.name + "  ·  " + detail
                                + "  (" + current + "/" + totalVal + ")");
                    }
                }

                @Override
                public void warn(String message) {
                    // warn 不中断 sticky footer — footer 自动保持在底部
                    System.out.println(CyberColor.AMBER + "  ! " + entry.name + ": "
                            + message + CyberColor.RESET);
                }
            };

            // 执行阶段
            footer.tick(entry.name + " …");
            StartupResult result;
            try {
                result = entry.runner.run(phaseCtx);
            } catch (Exception e) {
                result = StartupResult.failed(e.getMessage(), e);
            }

            double elapsed = (System.nanoTime() - phaseStart) / 1_000_000_000.0;
            String summary = result.summary() != null ? result.summary() : "";
            if (elapsed >= 0.05) summary += " (" + String.format("%.1f", elapsed) + "s)";

            String statusLine;
            if (result.success()) {
                statusLine = CyberColor.GREEN + "✓" + CyberColor.RESET
                        + " " + entry.name + "  " + CyberColor.GRAY + summary + CyberColor.RESET;
            } else {
                statusLine = CyberColor.RED + "✗" + CyberColor.RESET
                        + " " + entry.name + "  " + CyberColor.RED + summary + CyberColor.RESET;
            }
            completed.add(statusLine);

            // 短暂展示结果
            footer.update("");
            try { Thread.sleep(300); } catch (InterruptedException ignored) {}
        }

        // ── 关闭 footer，打印横幅 + 摘要 ──
        footer.shutdown("");

        // 打印标题横幅 + 已完成列表
        System.out.println();
        System.out.println(PhaseFrame.banner(
                "🧬 TWIN SYSTEM v" + appVersion,
                "Neuro-Synced Infrastructure"));
        System.out.println();

        for (String line : completed) {
            System.out.println("  " + line);
        }

        double totalElapsed = 0;
        // (elapsed tracked per phase, we just use the last phase's relative time)
        System.out.println();
        boolean allOk = completed.stream().noneMatch(l -> l.contains(CyberColor.RED));
        String line1 = "TWIN SYSTEM " + (allOk ? "READY" : "DEGRADED")
                + "  ·  :" + port + "  ·  startup complete";
        String line2 = "http://localhost:5173  ·  profile: " + profile;
        System.out.println(PhaseFrame.resultBox(allOk, line1, line2));
        System.out.println();
    }

    // ── 日志分类扫描 (unchanged) ──

    private void scanLogCategories() {
        Map<String, Object> beans = ctx.getBeansWithAnnotation(LogCategoryAnno.class);
        LogCategoryRegistry registry = LogCategoryRegistry.getInstance();
        for (Object bean : beans.values()) {
            LogCategoryAnno ann = bean.getClass().getAnnotation(LogCategoryAnno.class);
            if (ann == null) continue;
            ch.qos.logback.classic.Level level = ch.qos.logback.classic.Level.toLevel(
                    ann.defaultLevel(), ch.qos.logback.classic.Level.INFO);
            registry.register(ann.key(), ann.loggerName(), ann.description(), level);
        }
        ensureLegacyCategories(registry);
    }

    private void ensureLegacyCategories(LogCategoryRegistry registry) {
        addIfAbsent(registry, "twin", "com.example.demo.modules.twin", "孪生/门禁模块", ch.qos.logback.classic.Level.INFO);
        addIfAbsent(registry, "telemetry", "com.example.demo.modules.telemetry", "遥测模块", ch.qos.logback.classic.Level.INFO);
        addIfAbsent(registry, "dahua", "com.example.demo.modules.dahua", "大华模块", ch.qos.logback.classic.Level.INFO);
        addIfAbsent(registry, "aro", "com.example.demo.modules.aro", "ARO 同步", ch.qos.logback.classic.Level.INFO);
        addIfAbsent(registry, "accessfusion", "com.example.demo.modules.accessfusion", "门禁清洗", ch.qos.logback.classic.Level.WARN);
        addIfAbsent(registry, "sql", "com.example.demo.modules", "SQL 语句", ch.qos.logback.classic.Level.WARN);
        addIfAbsent(registry, "request", "org.springframework.web", "请求流量", ch.qos.logback.classic.Level.WARN);
    }

    private void addIfAbsent(LogCategoryRegistry registry, String key, String loggerName,
                              String description, ch.qos.logback.classic.Level level) {
        if (registry.get(key).isEmpty()) {
            registry.register(key, loggerName, description, level);
        }
    }

    private record PhaseEntry(String name, int order, String description,
                               boolean subtasks, StartupRunner runner) {}
}
