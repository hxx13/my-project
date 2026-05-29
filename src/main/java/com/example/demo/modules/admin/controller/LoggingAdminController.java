package com.example.demo.modules.admin.controller;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import com.example.demo.common.config.DebugToggleService;
import com.example.demo.common.support.LogRingBuffer;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/admin/logging")
public class LoggingAdminController {

    private static final List<String> LEVEL_OPTIONS = List.of("OFF", "ERROR", "WARN", "INFO", "DEBUG");

    private final DebugToggleService debugToggleService;

    public LoggingAdminController(DebugToggleService debugToggleService) {
        this.debugToggleService = debugToggleService;
    }

    @GetMapping("/levels")
    public Map<String, Object> getLevels() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("root", getRootLevel());
        result.put("levelOptions", LEVEL_OPTIONS);

        List<Map<String, String>> categories = new ArrayList<>();
        for (var entry : DebugToggleService.LOG_CATEGORIES.entrySet()) {
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
        ctx.getLogger(Logger.ROOT_LOGGER_NAME).setLevel(Level.INFO);
        for (String name : DebugToggleService.LOG_CATEGORIES.values()) {
            ctx.getLogger(name).setLevel(null);
        }
        return Map.of("ok", true, "message", "已恢复默认级别: ROOT=INFO，所有分类继承 ROOT");
    }

    /** 从 DB 同步日志级别与 debug 开关（等同于重启后的状态） */
    @PostMapping("/sync-from-db")
    public Map<String, Object> syncFromDb() {
        debugToggleService.refreshAll();
        return Map.of("ok", true, "message", "已从 sys_system_config 同步所有日志级别与 debug 开关");
    }

    /** 返回 integration debug 开关当前状态 */
    @GetMapping("/toggles")
    public Map<String, Object> getToggles() {
        Map<String, Object> toggles = new LinkedHashMap<>();
        toggles.put("scanTimingConsoleEnabled", debugToggleService.isScanTimingConsoleEnabled());
        toggles.put("scanTimingConsoleMinMs", debugToggleService.getScanTimingConsoleMinMs());
        toggles.put("accessRuleDahuaDebugEnabled", debugToggleService.isAccessRuleDahuaDebugEnabled());
        toggles.put("telemetryArchiveEnabled", debugToggleService.isTelemetryArchiveEnabled());
        toggles.put("rootLevel", debugToggleService.getRootLevel());

        List<Map<String, Object>> cats = new ArrayList<>();
        for (var entry : DebugToggleService.LOG_CATEGORIES.entrySet()) {
            cats.add(Map.of("key", entry.getKey(), "enabled", debugToggleService.isCategoryEnabled(entry.getKey())));
        }
        toggles.put("categories", cats);
        return toggles;
    }

    private String getRootLevel() {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        return ctx.getLogger(Logger.ROOT_LOGGER_NAME).getEffectiveLevel().toString();
    }

    /** 从环形缓冲区拉取最近日志 */
    @GetMapping("/recent")
    public Map<String, Object> getRecent(
            @RequestParam(defaultValue = "200") int count,
            @RequestParam(defaultValue = "") String minLevel) {
        LogRingBuffer buffer = LogRingBuffer.getInstance();
        List<Map<String, Object>> entries = buffer.recent(count, minLevel);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("entries", entries);
        result.put("total", buffer.size());
        return result;
    }

    /** 清空环形缓冲区 */
    @PostMapping("/clear-buffer")
    public Map<String, Object> clearBuffer() {
        LogRingBuffer.getInstance().clear();
        return Map.of("ok", true, "message", "日志缓冲区已清空");
    }

    private String getLoggerLevel(String loggerName) {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        Level effective = ctx.getLogger(loggerName).getEffectiveLevel();
        return effective != null ? effective.toString() : "继承 ROOT";
    }
}
