package com.example.demo.common.logging.config;

import com.example.demo.common.logging.annotation.LogCategoryAnno;
import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.banner.*;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.text.FigletRenderer;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import ch.qos.logback.classic.Level;
import com.example.demo.common.logging.registry.LogCategory;
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

import java.io.IOException;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;

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

    @Value("${twin.banner.style:figlet}")
    private String bannerStyle;

    @Value("${twin.banner.spinner-style:dots}")
    private String spinnerStyleConfig;

    @Value("${app.socketio.port:9092}")
    private int socketioPort;

    @Value("${spring.datasource.url:}")
    private String dbUrl;

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

        // ── Spinner 复用（跨阶段，帧自然递增） ──
        Spinner spinner = new Spinner(parseSpinnerStyle(spinnerStyleConfig));
        boolean anyFailed = false;

        for (PhaseEntry entry : entries) {
            AtomicInteger done = new AtomicInteger(0);
            AtomicInteger total = new AtomicInteger(0);
            long phaseStart = System.nanoTime();

            // 构建上下文 — \r 原地刷新进度条到 stderr
            StartupContext phaseCtx = new StartupContext() {
                private void renderProgress() {
                    String frame = spinner.tick();
                    String bar = ProgressBar.render(done.get(), Math.max(total.get(), done.get()), null);
                    String line = "  " + frame + " " + padRightTo(entry.name, 10) + " " + bar;
                    System.err.print("\r" + padRight(line));
                }

                @Override
                public void subtask(String label, Runnable task) {
                    total.incrementAndGet();
                    renderProgress();
                    try {
                        task.run();
                    } finally {
                        done.incrementAndGet();
                        renderProgress();
                    }
                }

                @Override
                public void progress(int current, int totalVal, String detail) {
                    done.set(current);
                    total.set(totalVal);
                    renderProgress();
                }

                @Override
                public void warn(String message) {
                    System.err.println();
                    System.err.println("  ! " + entry.name + ": " + message);
                    renderProgress();
                }
            };

            // 执行阶段
            System.err.print("\r  " + spinner.tick() + " " + padRightTo(entry.name, 10) + " …");
            StartupResult result;
            try {
                result = entry.runner.run(phaseCtx);
            } catch (Exception e) {
                result = StartupResult.failed(e.getMessage(), e);
            }

            double elapsed = (System.nanoTime() - phaseStart) / 1_000_000_000.0;
            // 无 subtask 且 < 50ms → 静默跳过，不输出
            int finalTotal = total.get();
            if (finalTotal > 0 || elapsed >= 0.05) {
                String summary = result.summary() != null ? result.summary() : "";
                if (elapsed >= 0.05) summary += " (" + String.format("%.1f", elapsed) + "s)";

                String mark = result.success() ? "✓" : "✗";
                String statusLine;
                if (finalTotal > 0) {
                    String bar = ProgressBar.render(done.get(), finalTotal, null);
                    statusLine = mark + " " + padRightTo(entry.name, 10) + " " + bar + "  " + summary;
                } else {
                    statusLine = mark + " " + padRightTo(entry.name, 10) + "  " + summary;
                }
                System.err.print("\r" + padRight("  " + statusLine));
                System.err.println();
            } else {
                // 清掉初始的 "…" 行
                System.err.print("\r" + " ".repeat(120) + "\r");
            }

            if (!result.success()) anyFailed = true;
        }

        // ── 启动信息面板 ──
        System.out.println();
        renderStartupPanel(anyFailed);
        System.out.println();
    }

    // ── 标题横幅 + 结果框 + Spinner 配置解析 ──

    private void renderStartupPanel(boolean degraded) {
        String javaVer = System.getProperty("java.version", "?");
        String osName  = System.getProperty("os.name", "?");

        // 从 JDBC URL 中提取数据库类型
        String dbType = "MySQL";
        if (dbUrl.contains(":mysql:")) dbType = "MySQL";
        else if (dbUrl.contains(":mariadb:")) dbType = "MariaDB";
        else if (dbUrl.contains(":postgresql:")) dbType = "PostgreSQL";
        else if (dbUrl.contains(":h2:")) dbType = "H2";

        java.util.List<String> figletLines = FigletRenderer.render("TWIN");
        boolean hasFiglet = figletLines.size() > 1;

        // 信息行
        List<String> infoLines = new ArrayList<>();
        infoLines.add("Java " + javaVer + "  |  " + dbType + "  |  " + osName);
        infoLines.add(":" + port + "  |  http://localhost:5173  |  Socket.IO :" + socketioPort);
        infoLines.add("profile: " + profile + "  |  v" + appVersion);
        String statusLine = (degraded ? "DEGRADED" : "READY")
                + "  ·  startup complete";

        // 计算面板宽度
        int w = statusLine.length();
        for (String l : infoLines) if (l.length() > w) w = l.length();
        for (String l : figletLines) if (l.length() > w) w = l.length();
        w = Math.max(w, 44) + 4;
        String barH = "═".repeat(w);
        String barS = "─".repeat(w);

        // ── 面板 ──
        System.out.println("  ╔" + barH + "╗");

        if (hasFiglet) {
            for (String line : figletLines) {
                System.out.println("  ║  " + center(line, w - 4) + "  ║");
            }
        } else {
            System.out.println("  ║  " + center("🧬  TWIN  SYSTEM  v" + appVersion, w - 4) + "  ║");
            System.out.println("  ║  " + center("Neuro-Synced Infrastructure", w - 4) + "  ║");
        }

        System.out.println("  ╟" + barS + "╢");
        for (String line : infoLines) {
            System.out.println("  ║  " + line + " ".repeat(w - 4 - line.length()) + "  ║");
        }
        System.out.println("  ╟" + barS + "╢");
        System.out.println("  ║  " + statusLine + " ".repeat(w - 4 - statusLine.length()) + "  ║");
        System.out.println("  ╚" + barH + "╝");
    }

    private static String center(String s, int width) {
        int pad = width - s.length();
        if (pad <= 0) return s;
        int left = pad / 2;
        return " ".repeat(left) + s + " ".repeat(pad - left);
    }

    private Spinner.SpinnerStyle parseSpinnerStyle(String config) {
        if (config == null) return Spinner.SpinnerStyle.SHUTTLE;
        return switch (config.trim().toLowerCase()) {
            case "shuttle" -> Spinner.SpinnerStyle.SHUTTLE;
            case "pulse"   -> Spinner.SpinnerStyle.PULSE;
            case "classic" -> Spinner.SpinnerStyle.CLASSIC;
            case "dots"    -> Spinner.SpinnerStyle.DOTS;
            case "arc"     -> Spinner.SpinnerStyle.ARC;
            default        -> Spinner.SpinnerStyle.SHUTTLE;
        };
    }

    private static String padRightTo(String s, int width) {
        if (s.length() >= width) return s;
        return s + " ".repeat(width - s.length());
    }

    /** 补齐到 120 字符宽度，防止 \r 残留旧内容 */
    private static String padRight(String s) {
        int width = 120;
        if (s.length() >= width) return s;
        return s + " ".repeat(width - s.length());
    }

    // ── 日志分类扫描 ──

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
        registerRemainingPackages(registry);
    }

    private void ensureLegacyCategories(LogCategoryRegistry registry) {
        // ── 现有（保留）──
        addIfAbsent(registry, "twin", "com.example.demo.modules.twin", "孪生/门禁", Level.INFO);
        addIfAbsent(registry, "telemetry", "com.example.demo.modules.telemetry", "遥测", Level.INFO);
        addIfAbsent(registry, "dahua", "com.example.demo.modules.dahua", "大华", Level.INFO);
        addIfAbsent(registry, "aro", "com.example.demo.modules.aro", "ARO同步", Level.INFO);
        addIfAbsent(registry, "accessfusion", "com.example.demo.modules.accessfusion", "门禁清洗", Level.WARN);
        // ⚠️ 修正: 保持 com.example.demo.modules 以覆盖全部模块的 MyBatis mapper SQL
        addIfAbsent(registry, "sql", "com.example.demo.modules", "SQL语句", Level.WARN);
        addIfAbsent(registry, "request", "org.springframework.web", "请求流量", Level.WARN);

        // ── LLM ──
        addIfAbsent(registry, "llm", "com.example.demo.modules.llm", "大模型/AI", Level.INFO);

        // ── 业务模块（补全至 35+ 个）──
        addIfAbsent(registry, "student", "com.example.demo.modules.student", "学生/手机端", Level.INFO);
        addIfAbsent(registry, "analytics", "com.example.demo.modules.analytics", "数据分析", Level.INFO);
        addIfAbsent(registry, "facerecognition", "com.example.demo.modules.facerecognition", "人脸识别", Level.INFO);
        addIfAbsent(registry, "reportform", "com.example.demo.modules.reportform", "报表", Level.INFO);
        addIfAbsent(registry, "material", "com.example.demo.modules.material", "物资管理", Level.INFO);
        addIfAbsent(registry, "knowledge", "com.example.demo.modules.knowledge", "知识库", Level.INFO);
        addIfAbsent(registry, "notification", "com.example.demo.modules.notification", "通知", Level.INFO);
        addIfAbsent(registry, "admin", "com.example.demo.modules.admin", "系统管理", Level.INFO);
        addIfAbsent(registry, "cageshelf", "com.example.demo.modules.cageshelf", "笼位管理", Level.INFO);
        addIfAbsent(registry, "speech", "com.example.demo.modules.speech", "语音播报", Level.INFO);
        addIfAbsent(registry, "auth", "com.example.demo.modules.auth", "认证", Level.INFO);
        addIfAbsent(registry, "upload", "com.example.demo.modules.upload", "文件上传", Level.INFO);
        addIfAbsent(registry, "mp", "com.example.demo.modules.mp", "小程序", Level.INFO);
        addIfAbsent(registry, "facilitymaintenance", "com.example.demo.modules.facilitymaintenance", "设施维护", Level.INFO);
        addIfAbsent(registry, "accessrule", "com.example.demo.modules.accessrule", "门禁规则", Level.INFO);
        addIfAbsent(registry, "scanner", "com.example.demo.modules.scanner", "扫码设备", Level.INFO);
        addIfAbsent(registry, "swipealert", "com.example.demo.modules.swipealert", "刷卡告警", Level.INFO);
        addIfAbsent(registry, "common", "com.example.demo.common", "公共组件", Level.WARN);

        // ── 审查补全: 缺失模块 ──
        addIfAbsent(registry, "adminfile", "com.example.demo.modules.adminfile", "管理文件", Level.INFO);
        addIfAbsent(registry, "asset", "com.example.demo.modules.asset", "资产管理", Level.INFO);
        addIfAbsent(registry, "chat", "com.example.demo.modules.chat", "即时通讯", Level.INFO);
        addIfAbsent(registry, "docs", "com.example.demo.modules.docs", "文档管理", Level.INFO);
        addIfAbsent(registry, "invite", "com.example.demo.modules.invite", "邀请管理", Level.INFO);
        addIfAbsent(registry, "me", "com.example.demo.modules.me", "个人中心", Level.INFO);
        addIfAbsent(registry, "order", "com.example.demo.modules.order", "订单管理", Level.INFO);
        addIfAbsent(registry, "pagepermission", "com.example.demo.modules.pagepermission", "页面权限", Level.INFO);
        addIfAbsent(registry, "policy", "com.example.demo.modules.policy", "策略管理", Level.INFO);
        addIfAbsent(registry, "repair", "com.example.demo.modules.repair", "报修管理", Level.INFO);
        addIfAbsent(registry, "roommapping", "com.example.demo.modules.roommapping", "房间映射", Level.INFO);
        addIfAbsent(registry, "site", "com.example.demo.modules.site", "站点管理", Level.INFO);
        addIfAbsent(registry, "supplies", "com.example.demo.modules.supplies", "耗材管理", Level.INFO);
    }

    /**
     * 使用 classpath 扫描自动发现 com.example.demo.modules 下未被手动/注解注册的子包。
     * 适用于开发环境（filesystem）和生产环境（JAR），确保自动发现始终生效。
     * 日志级别默认 INFO，可通过 sys_system_config 动态调整。
     */
    private void registerRemainingPackages(LogCategoryRegistry registry) {
        Set<String> knownKeys = registry.all().stream()
                .map(LogCategory::key)
                .collect(Collectors.toSet());

        String basePackage = "com.example.demo.modules";
        String packagePath = basePackage.replace('.', '/');

        try {
            ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources(
                    "classpath*:" + packagePath + "/**/*.class");

            Set<String> scannedPackages = new LinkedHashSet<>();
            for (Resource res : resources) {
                String url = res.getURL().getPath();
                int bangIdx = url.lastIndexOf("!/");
                String classPath = bangIdx >= 0 ? url.substring(bangIdx + 2) : url;
                int pkgIdx = classPath.indexOf(packagePath);
                if (pkgIdx < 0) continue;
                String subPath = classPath.substring(pkgIdx + packagePath.length() + 1);
                int slashIdx = subPath.indexOf('/');
                if (slashIdx > 0) subPath = subPath.substring(0, slashIdx);
                if (subPath.isEmpty() || subPath.contains(".")) continue;
                scannedPackages.add(subPath);
            }

            for (String pkgName : scannedPackages) {
                if (pkgName.startsWith(".")) continue;
                if (knownKeys.contains(pkgName)) continue;

                String loggerName = basePackage + "." + pkgName;
                registry.register(pkgName, loggerName, pkgName + "模块", Level.INFO);
                log.debug("[log-category] auto-registered: key={}, logger={}", pkgName, loggerName);
            }
        } catch (IOException e) {
            log.warn("[log-category] classpath 自动扫描失败，回退到手动注册: {}", e.getMessage());
        }
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
