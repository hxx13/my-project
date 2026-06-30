package com.example.demo.common.logging.config;

import com.example.demo.common.logging.annotation.LogCategoryAnno;
import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.banner.StartupBanner;
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

/**
 * 启动阶段编排器。
 * <ol>
 *   <li>扫描所有带 {@link StartupPhase @StartupPhase} 的 {@link StartupRunner} Bean</li>
 *   <li>按 order 排序</li>
 *   <li>通过 {@link StartupBanner} 动画化执行</li>
 *   <li>扫描所有带 {@link LogCategoryAnno @LogCategoryAnno} 的类，注册到 {@link LogCategoryRegistry}</li>
 *   <li>完成后打印 READY 横幅</li>
 * </ol>
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
        // 1. 扫描日志分类
        scanLogCategories();

        // 2. 扫描启动阶段
        Map<String, Object> phaseBeans = ctx.getBeansWithAnnotation(StartupPhase.class);
        if (phaseBeans.isEmpty()) {
            log.info("No @StartupPhase beans found — banner skipped");
            return;
        }

        List<PhaseEntry> entries = new ArrayList<>();
        for (Object bean : phaseBeans.values()) {
            if (!(bean instanceof StartupRunner runner)) {
                log.warn("Bean {} has @StartupPhase but does not implement StartupRunner — skipped",
                        bean.getClass().getSimpleName());
                continue;
            }
            StartupPhase ann = bean.getClass().getAnnotation(StartupPhase.class);
            entries.add(new PhaseEntry(ann.name(), ann.order(), ann.description(), ann.subtasks(), runner));
        }
        entries.sort(Comparator.comparingInt(PhaseEntry::order));

        // 3. 动画执行
        StartupBanner banner = StartupBanner.create(System.out)
                .title("🧬 TWIN SYSTEM v" + appVersion)
                .subtitle("Neuro-Synced Infrastructure");

        for (PhaseEntry entry : entries) {
            banner.phase(entry.name, entry.description, entry.runner);
        }

        banner.finish(String.valueOf(port), profile);
    }

    // --- 扫描日志分类注册 ---

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

        if (!beans.isEmpty()) {
            log.debug("[logging] 从 @LogCategoryAnno 注册了 {} 个日志分类", beans.size());
        }

        // 兜底：保留旧 DebugToggleService 中的分类（向后兼容）
        ensureLegacyCategories(registry);
    }

    /** 确保旧分类在 Registry 中也有对应条目，直到迁移完成。 */
    private void ensureLegacyCategories(LogCategoryRegistry registry) {
        // 这些与 DebugToggleService.LOG_CATEGORIES 对齐
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

    // --- data class ---

    private record PhaseEntry(String name, int order, String description,
                               boolean subtasks, StartupRunner runner) {}
}
