package com.example.demo.common.config;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import com.example.demo.common.event.CredentialsChangedEvent;
import com.example.demo.common.logging.registry.LogCategory;
import com.example.demo.common.logging.registry.LogCategoryRegistry;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 集中管理所有 debug/logging 开关，支持运行时热切换（无需重启）。
 * 数据源：sys_system_config 表中 module=integration / module=logging 的配置项，
 * 通过 {@link NotificationSettingsService#getEffectiveValue} 读取，
 * 监听 {@link CredentialsChangedEvent} 自动刷新。
 */
@Service
public class DebugToggleService {

    /**
     * 日志分类列表，从 {@link LogCategoryRegistry} 动态获取。
     * @deprecated 新代码请直接使用 {@code LogCategoryRegistry.getInstance().all()}
     */
    @Deprecated
    public static LinkedHashMap<String, String> getLogCategories() {
        LinkedHashMap<String, String> map = new LinkedHashMap<>();
        for (LogCategory cat : LogCategoryRegistry.getInstance().all()) {
            map.put(cat.key(), cat.loggerName());
        }
        return map;
    }

    /** @deprecated 请使用 {@link #getLogCategories()} */
    @Deprecated
    public static final LinkedHashMap<String, String> LOG_CATEGORIES = new LinkedHashMap<>();

    private final NotificationSettingsService settingsService;

    private final AtomicBoolean scanTimingConsoleEnabled = new AtomicBoolean(true);
    private final AtomicLong scanTimingConsoleMinMs = new AtomicLong(300);
    private final AtomicBoolean accessRuleDahuaDebugEnabled = new AtomicBoolean(true);
    private final AtomicBoolean telemetryArchiveEnabled = new AtomicBoolean(true);

    /** category key (e.g. "twin") → true=DEBUG, false=INFO */
    private final Map<String, Boolean> categoryEnabled = new LinkedHashMap<>();

    private volatile String rootLevel = "INFO";

    public DebugToggleService(NotificationSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @PostConstruct
    public void init() {
        refreshAll();
    }

    // ---------- Public getters (read on every call, no cache staleness) ----------

    public boolean isScanTimingConsoleEnabled() {
        return scanTimingConsoleEnabled.get();
    }

    public long getScanTimingConsoleMinMs() {
        return scanTimingConsoleMinMs.get();
    }

    public boolean isAccessRuleDahuaDebugEnabled() {
        return accessRuleDahuaDebugEnabled.get();
    }

    public boolean isTelemetryArchiveEnabled() {
        return telemetryArchiveEnabled.get();
    }

    public boolean isCategoryEnabled(String categoryKey) {
        return categoryEnabled.getOrDefault(categoryKey, true);
    }

    public String getRootLevel() {
        return rootLevel;
    }

    // ---------- Hot reload ----------

    @EventListener
    public void onCredentialsChanged(CredentialsChangedEvent event) {
        if ("integration".equals(event.getModule()) || "logging".equals(event.getModule())) {
            refreshAll();
        }
    }

    /**
     * 从 DB 重新加载所有开关并同步 Logback 级别。
     * 公开方法，供 LoggingAdminController 在手动 sync-from-db 时调用。
     */
    public void refreshAll() {
        refreshIntegrationToggles();
        refreshLoggingCategories();
    }

    private void refreshIntegrationToggles() {
        scanTimingConsoleEnabled.set(
                toBool(settingsService.getEffectiveValue("integration", "scan.analyze_timing_console", "true")));
        String minMsStr = settingsService.getEffectiveValue("integration", "scan.analyze_timing_console_min_ms", "300");
        try {
            scanTimingConsoleMinMs.set(Long.parseLong(minMsStr));
        } catch (NumberFormatException ignored) {
            scanTimingConsoleMinMs.set(300);
        }
        accessRuleDahuaDebugEnabled.set(
                toBool(settingsService.getEffectiveValue("integration", "access_rule_dahua_debug", "true")));
        telemetryArchiveEnabled.set(
                toBool(settingsService.getEffectiveValue("integration", "telemetry.archive.enabled", "true")));
    }

    private void refreshLoggingCategories() {
        String dbRootLevel = settingsService.getEffectiveValue("logging", "logging.console.level", "INFO");
        rootLevel = dbRootLevel;

        ch.qos.logback.classic.LoggerContext ctx =
                (ch.qos.logback.classic.LoggerContext) LoggerFactory.getILoggerFactory();

        // 应用 ROOT 级别
        Level rootLvl = Level.toLevel(rootLevel, Level.INFO);
        ctx.getLogger(Logger.ROOT_LOGGER_NAME).setLevel(rootLvl);

        for (LogCategory cat : LogCategoryRegistry.getInstance().all()) {
            String catKey = cat.key();
            String loggerName = cat.loggerName();
            String configKey = "logging.category." + catKey;
            boolean enabled = toBool(settingsService.getEffectiveValue("logging", configKey, "true"));
            categoryEnabled.put(catKey, enabled);

            Logger logger = ctx.getLogger(loggerName);
            if (enabled) {
                logger.setLevel(null); // 继承 ROOT
            } else {
                logger.setLevel(Level.OFF);
            }
        }
    }

    private static boolean toBool(String value) {
        return "true".equalsIgnoreCase(value) || "1".equals(value);
    }
}
