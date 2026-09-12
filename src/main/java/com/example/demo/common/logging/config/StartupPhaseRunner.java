package com.example.demo.common.logging.config;

import com.example.demo.common.logging.annotation.LogCategoryAnno;
import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.banner.*;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.text.BlockTitle;
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
 * 启动阶段编排器 — 单行粘性状态栏（原地刷新）+ 阶段完成后逐行落定。
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

        StartupDashboard dash = new StartupDashboard(System.out, parseSpinnerStyle(spinnerStyleConfig));
        List<StartupDashboard.Row> dashRows = new ArrayList<>(entries.size());
        for (PhaseEntry e : entries) dashRows.add(dash.declare(e.name));

        boolean anyFailed = false;
        dash.open();
        try {
            for (int i = 0; i < entries.size(); i++) {
                PhaseEntry entry = entries.get(i);
                StartupDashboard.Row row = dashRows.get(i);
                dash.begin(row);

                AtomicInteger done = new AtomicInteger(0);
                AtomicInteger total = new AtomicInteger(0);
                long phaseStart = System.nanoTime();

                StartupContext phaseCtx = new StartupContext() {
                    @Override
                    public void subtask(String label, Runnable task) {
                        int started = total.incrementAndGet();
                        dash.progress(row, done.get(), started, label);
                        try {
                            task.run();
                        } finally {
                            dash.progress(row, done.incrementAndGet(), total.get(), label);
                        }
                    }

                    @Override
                    public void progress(int current, int totalVal, String detail) {
                        if (totalVal > 0) total.set(totalVal);
                        done.set(current);
                        dash.progress(row, current, Math.max(total.get(), current), detail);
                    }

                    @Override
                    public void warn(String message) {
                        dash.note(CyberColor.AMBER + "  ! " + entry.name + ": " + message + CyberColor.RESET);
                    }
                };

                StartupResult result;
                try {
                    result = entry.runner.run(phaseCtx);
                } catch (Exception e) {
                    result = StartupResult.failed(e.getMessage(), e);
                }

                double elapsed = (System.nanoTime() - phaseStart) / 1_000_000_000.0;
                String summary = result.summary() != null ? result.summary() : "";
                if (elapsed >= 0.05) {
                    summary += (summary.isEmpty() ? "" : " ") + String.format("(%.1fs)", elapsed);
                }
                if (!result.success()) {
                    anyFailed = true;
                    if (result.error() != null) {
                        String msg = result.error().getMessage() != null
                                ? result.error().getMessage()
                                : result.error().getClass().getSimpleName();
                        summary += (summary.isEmpty() ? "" : " — ") + msg;
                    }
                }
                dash.complete(row, result.success(), summary);
            }
        } finally {
            dash.close();
        }

        // ── 启动信息面板 ──
        System.out.println();
        renderStartupPanel(anyFailed, entries.size(), dash);
        System.out.println();
    }

    // ── 标题横幅 + 结果框 + Spinner 配置解析 ──

    private void renderStartupPanel(boolean degraded, int phaseCount, StartupDashboard dash) {
        String javaVer = System.getProperty("java.version", "?");
        String osName  = System.getProperty("os.name", "?");

        // 从 JDBC URL 中提取数据库类型
        String dbType = "MySQL";
        if (dbUrl.contains(":mariadb:")) dbType = "MariaDB";
        else if (dbUrl.contains(":postgresql:")) dbType = "PostgreSQL";
        else if (dbUrl.contains(":h2:")) dbType = "H2";

        List<String> titleLines = BlockTitle.render("TWIN");
        boolean hasTitle = titleLines.size() > 1;

        List<String> infoLines = new ArrayList<>();
        infoLines.add("Java " + javaVer + "   ·   " + dbType + "   ·   " + osName);
        infoLines.add("http://localhost:5173   ·   :" + port + "   ·   Socket.IO :" + socketioPort);
        infoLines.add("profile: " + profile + "   ·   v" + appVersion);

        String status = (degraded ? "✗ DEGRADED" : "✓ READY")
                + "   ·   " + phaseCount + " phases   ·   "
                + String.format("%.1fs", dash.elapsedSeconds());

        // 计算面板宽度
        int w = status.length();
        for (String l : infoLines) if (l.length() > w) w = l.length();
        for (String l : titleLines) if (l.length() > w) w = l.length();
        w = Math.max(w, 46) + 4;
        String barH = "═".repeat(w);
        String barS = "─".repeat(w);

        // ── 面板 ──
        List<String> box = new ArrayList<>();
        box.add("  " + CyberColor.PURPLE + "╔" + barH + "╗" + CyberColor.RESET);
        if (hasTitle) {
            for (String line : titleLines) box.add(edge(w, CyberColor.CYAN + CyberColor.BOLD, center(line, w - 4)));
        } else {
            box.add(edge(w, CyberColor.CYAN + CyberColor.BOLD, center("TWIN SYSTEM  v" + appVersion, w - 4)));
        }
        box.add(edge(w, CyberColor.MAGENTA, center("NEURO-SYNCED INFRASTRUCTURE", w - 4)));
        box.add("  " + CyberColor.PURPLE + "╟" + barS + "╢" + CyberColor.RESET);
        for (String line : infoLines) box.add(edge(w, CyberColor.GRAY, padRightTo(line, w - 4)));
        box.add("  " + CyberColor.PURPLE + "╟" + barS + "╢" + CyberColor.RESET);
        box.add(edge(w, degraded ? CyberColor.RED : CyberColor.GREEN, padRightTo(status, w - 4)));
        box.add("  " + CyberColor.PURPLE + "╚" + barH + "╝" + CyberColor.RESET);

        printBox(box, barH, dash.isLive());
    }

    /** 把内容套进左右边框，边框用暗紫、内容用给定色。 */
    private static String edge(int w, String color, String content) {
        return "  " + CyberColor.PURPLE + "║" + CyberColor.RESET
                + "  " + color + content + CyberColor.RESET + "  "
                + CyberColor.PURPLE + "║" + CyberColor.RESET;
    }

    /** 逐帧从中心向两侧铺开顶边框，然后自上而下落位每一行。 */
    private static void printBox(List<String> box, String barH, boolean live) {
        if (!live) {
            for (String line : box) System.out.println(line);
            return;
        }
        final int steps = 10;
        for (int s = 1; s <= steps; s++) {
            int len = Math.max(1, barH.length() * s / steps);
            int start = (barH.length() - len) / 2;
            System.out.print("\r\033[2K  " + CyberColor.PURPLE
                    + barH.substring(start, start + len) + CyberColor.RESET);
            System.out.flush();
            sleep(20);
        }
        System.out.print("\r\033[2K" + box.get(0) + "\n");
        for (int i = 1; i < box.size(); i++) {
            System.out.println(box.get(i));
            System.out.flush();
            sleep(16);
        }
        System.out.flush();
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
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
