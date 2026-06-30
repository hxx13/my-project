package com.example.demo.common.logging.registry;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 全局日志分类注册中心 —— 替代 {@code DebugToggleService.LOG_CATEGORIES} 硬编码。
 * 线程安全单例，支持运行时动态增删改查。
 *
 * <h3>使用方式</h3>
 * <pre>{@code
 * LogCategoryRegistry.getInstance().register("face", "com.example.demo.modules.face",
 *     "人脸识别模块", Level.WARN);
 * LogCategoryRegistry.getInstance().setLevel("face", Level.DEBUG);
 * }</pre>
 */
public final class LogCategoryRegistry {

    private static final LogCategoryRegistry INSTANCE = new LogCategoryRegistry();

    private final ConcurrentMap<String, LogCategory> categories = new ConcurrentHashMap<>();

    private LogCategoryRegistry() {}

    public static LogCategoryRegistry getInstance() {
        return INSTANCE;
    }

    /** 注册一个日志分类（幂等：同 key 后注册覆盖前注册）。 */
    public void register(String key, String loggerName, String description, Level defaultLevel) {
        LogCategory cat = new LogCategory(key, loggerName, description, defaultLevel);
        categories.put(key, cat);
        applyLevel(cat, defaultLevel);
    }

    /** 注销一个分类。 */
    public void unregister(String key) {
        LogCategory cat = categories.remove(key);
        if (cat != null) {
            // 恢复为继承 ROOT
            LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
            ctx.getLogger(cat.loggerName()).setLevel(null);
        }
    }

    /** 运行时修改某个分类的日志级别。 */
    public void setLevel(String key, Level level) {
        LogCategory cat = categories.get(key);
        if (cat == null) return;
        applyLevel(cat, level);
    }

    /** 获取分类信息。 */
    public Optional<LogCategory> get(String key) {
        return Optional.ofNullable(categories.get(key));
    }

    /** 所有已注册分类（不可变快照）。 */
    public Collection<LogCategory> all() {
        return Collections.unmodifiableCollection(categories.values());
    }

    /** 按 key 排序的注册表快照（供管理端 API 使用）。 */
    public LinkedHashMap<String, LogCategory> sortedSnapshot() {
        LinkedHashMap<String, LogCategory> map = new LinkedHashMap<>();
        categories.keySet().stream().sorted().forEach(k -> map.put(k, categories.get(k)));
        return map;
    }

    /** 将所有分类重置为默认级别。 */
    public void resetAll() {
        for (LogCategory cat : categories.values()) {
            applyLevel(cat, cat.defaultLevel());
        }
    }

    /** 从 Registry 同步到 Logback。 */
    public void syncToLogback() {
        for (LogCategory cat : categories.values()) {
            LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
            Logger logger = ctx.getLogger(cat.loggerName());
            if (logger.getLevel() == null || !logger.getLevel().equals(cat.defaultLevel())) {
                applyLevel(cat, cat.defaultLevel());
            }
        }
    }

    private void applyLevel(LogCategory cat, Level level) {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        Logger logger = ctx.getLogger(cat.loggerName());
        if (level == null) {
            logger.setLevel(null); // 继承 ROOT
        } else {
            logger.setLevel(level);
        }
    }
}
