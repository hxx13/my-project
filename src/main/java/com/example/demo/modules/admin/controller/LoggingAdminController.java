package com.example.demo.modules.admin.controller;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/logging")
public class LoggingAdminController {

    /**
     * 可在管理端调节的 logger 分类及其默认级别。
     * key = 管理端显示名，value = logger 名称前缀。
     */
    private static final LinkedHashMap<String, String> CATEGORIES = new LinkedHashMap<>();
    static {
        CATEGORIES.put("twin", "com.example.demo.modules.twin");
        CATEGORIES.put("telemetry", "com.example.demo.modules.telemetry");
        CATEGORIES.put("dahua", "com.example.demo.modules.dahua");
        CATEGORIES.put("aro", "com.example.demo.modules.aro");
        CATEGORIES.put("accessfusion", "com.example.demo.modules.accessfusion");
        CATEGORIES.put("sql", "com.example.demo.modules");
        CATEGORIES.put("request", "org.springframework.web");
    }

    private static final List<String> LEVEL_OPTIONS = List.of("OFF", "ERROR", "WARN", "INFO", "DEBUG");

    @GetMapping("/levels")
    public Map<String, Object> getLevels() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("root", getRootLevel());
        result.put("levelOptions", LEVEL_OPTIONS);

        List<Map<String, String>> categories = new ArrayList<>();
        for (var entry : CATEGORIES.entrySet()) {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("key", entry.getKey());
            item.put("loggerName", entry.getValue());
            item.put("level", getLoggerLevel(entry.getValue()));
            categories.add(item);
        }
        result.put("categories", categories);
        return result;
    }

    @PostMapping("/level")
    public Map<String, Object> setLevel(@RequestBody Map<String, String> body) {
        String loggerName = body.get("loggerName");
        String levelStr = body.get("level");
        if (loggerName == null || levelStr == null) {
            return Map.of("ok", false, "message", "缺少 loggerName 或 level");
        }
        Level level = Level.toLevel(levelStr, null);
        if (level == null && !"OFF".equalsIgnoreCase(levelStr)) {
            return Map.of("ok", false, "message", "无效的日志级别: " + levelStr + "，可选: " + String.join(", ", LEVEL_OPTIONS));
        }

        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        Logger logger = ctx.getLogger(loggerName);
        if ("OFF".equalsIgnoreCase(levelStr)) {
            logger.setLevel(Level.OFF);
        } else {
            logger.setLevel(level);
        }

        return Map.of("ok", true, "loggerName", loggerName, "level", logger.getEffectiveLevel().toString());
    }

    @PostMapping("/reset")
    public Map<String, Object> reset() {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        // 重置 ROOT 为 INFO
        ctx.getLogger(Logger.ROOT_LOGGER_NAME).setLevel(Level.INFO);
        // 重置各分类为 null（继承 ROOT）
        for (String name : CATEGORIES.values()) {
            ctx.getLogger(name).setLevel(null);
        }
        return Map.of("ok", true, "message", "已恢复默认级别: ROOT=INFO，所有分类继承 ROOT");
    }

    private String getRootLevel() {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        return ctx.getLogger(Logger.ROOT_LOGGER_NAME).getEffectiveLevel().toString();
    }

    private String getLoggerLevel(String loggerName) {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        Level effective = ctx.getLogger(loggerName).getEffectiveLevel();
        return effective != null ? effective.toString() : "继承 ROOT";
    }
}
