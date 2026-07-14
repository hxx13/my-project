package com.example.demo.modules.admin.controller;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import com.example.demo.common.config.DebugToggleService;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.logging.registry.LogCategory;
import com.example.demo.common.logging.registry.LogCategoryRegistry;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.common.support.LogRingBuffer;
import com.example.demo.modules.auth.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/admin/logging")
public class LoggingAdminController {

    private static final List<String> LEVEL_OPTIONS = List.of("OFF", "ERROR", "WARN", "INFO", "DEBUG");

    private final DebugToggleService debugToggleService;
    private final AuthContextService authContextService;
    private final HttpServletRequest request;

    public LoggingAdminController(DebugToggleService debugToggleService,
                                   AuthContextService authContextService,
                                   HttpServletRequest request) {
        this.debugToggleService = debugToggleService;
        this.authContextService = authContextService;
        this.request = request;
    }

    @GetMapping("/levels")
    public Object getLevels() {
        Result<?> denied = requireAdmin();
        if (denied != null) return denied;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("root", getRootLevel());
        result.put("levelOptions", LEVEL_OPTIONS);

        List<Map<String, String>> categories = new ArrayList<>();
        for (LogCategory cat : LogCategoryRegistry.getInstance().all()) {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("key", cat.key());
            item.put("loggerName", cat.loggerName());
            item.put("level", getLoggerLevel(cat.loggerName()));
            categories.add(item);
        }
        result.put("categories", categories);
        return result;
    }

    @PostMapping("/level")
    public Object setLevel(@RequestBody Map<String, String> body) {
        Result<?> denied = requireAdmin();
        if (denied != null) return denied;
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
    public Object reset() {
        Result<?> denied = requireAdmin();
        if (denied != null) return denied;
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        ctx.getLogger(Logger.ROOT_LOGGER_NAME).setLevel(Level.INFO);
        for (LogCategory cat : LogCategoryRegistry.getInstance().all()) {
            ctx.getLogger(cat.loggerName()).setLevel(null);
        }
        return Map.of("ok", true, "message", "已恢复默认级别: ROOT=INFO，所有分类继承 ROOT");
    }

    /** 从 DB 同步日志级别与 debug 开关（等同于重启后的状态） */
    @PostMapping("/sync-from-db")
    public Object syncFromDb() {
        Result<?> denied = requireAdmin();
        if (denied != null) return denied;
        debugToggleService.refreshAll();
        return Map.of("ok", true, "message", "已从 sys_system_config 同步所有日志级别与 debug 开关");
    }

    /** 返回 integration debug 开关当前状态 */
    @GetMapping("/toggles")
    public Object getToggles() {
        Result<?> denied = requireAdmin();
        if (denied != null) return denied;
        Map<String, Object> toggles = new LinkedHashMap<>();
        toggles.put("scanTimingConsoleEnabled", debugToggleService.isScanTimingConsoleEnabled());
        toggles.put("scanTimingConsoleMinMs", debugToggleService.getScanTimingConsoleMinMs());
        toggles.put("accessRuleDahuaDebugEnabled", debugToggleService.isAccessRuleDahuaDebugEnabled());
        toggles.put("telemetryArchiveEnabled", debugToggleService.isTelemetryArchiveEnabled());
        toggles.put("rootLevel", debugToggleService.getRootLevel());

        List<Map<String, Object>> cats = new ArrayList<>();
        for (LogCategory cat : LogCategoryRegistry.getInstance().all()) {
            cats.add(Map.of("key", cat.key(), "enabled", debugToggleService.isCategoryEnabled(cat.key())));
        }
        toggles.put("categories", cats);
        return toggles;
    }

    /**
     * 认证 + 角色鉴权，参照 MonitorController.java:881-891 的 requireAdmin 模式。
     * 仅 ADMIN（level>=4）及以上角色可访问日志管理端点。
     * 返回 null 表示通过；返回 Result 表示被拒绝（调用方直接 return）。
     */
    private Result<?> requireAdmin() {
        User user = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (user == null) return Result.fail(401, "未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.fail(401, "账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) return Result.fail(403, "需要管理员权限");
        return null;
    }

    private String getRootLevel() {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        return ctx.getLogger(Logger.ROOT_LOGGER_NAME).getEffectiveLevel().toString();
    }

    /** 从环形缓冲区拉取最近日志 */
    @GetMapping("/recent")
    public Object getRecent(
            @RequestParam(defaultValue = "200") int count,
            @RequestParam(defaultValue = "") String minLevel) {
        Result<?> denied = requireAdmin();
        if (denied != null) return denied;
        LogRingBuffer buffer = LogRingBuffer.getInstance();
        List<Map<String, Object>> entries = buffer.recent(count, minLevel);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("entries", entries);
        result.put("total", buffer.size());
        return result;
    }

    /** 清空环形缓冲区 */
    @PostMapping("/clear-buffer")
    public Object clearBuffer() {
        Result<?> denied = requireAdmin();
        if (denied != null) return denied;
        LogRingBuffer.getInstance().clear();
        return Map.of("ok", true, "message", "日志缓冲区已清空");
    }

    private String getLoggerLevel(String loggerName) {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        Level effective = ctx.getLogger(loggerName).getEffectiveLevel();
        return effective != null ? effective.toString() : "继承 ROOT";
    }
}
