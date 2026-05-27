package com.example.demo.modules.llm.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 控制台日志管理：超级管理员在「系统设置 → 控制台日志」维护。
 * 日志级别修改即时生效，重启后恢复 logback-spring.xml 默认值。
 */
@Component
@Order(126)
public class LoggingConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LoggingConfigSeed.class);

    private final JdbcTemplate jdbcTemplate;

    public LoggingConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            String levelOptions = "[\"OFF\",\"ERROR\",\"WARN\",\"INFO\",\"DEBUG\"]";
            ensureDef("logging", "logging.console.level", "ROOT 日志级别",
                    "控制台最低输出级别。改为 WARN 可屏蔽 INFO/DEBUG 日志，改为 OFF 完全静默。重启后恢复 INFO。",
                    "STRING", levelOptions, "INFO", 0, 0, 0);

            ensureCategory("logging.category.twin", "孪生/门禁模块", "刷卡记录、发卡、扫码、看板、预测等");
            ensureCategory("logging.category.telemetry", "遥测模块", "WinCC 拉取、动物房温湿度、归档");
            ensureCategory("logging.category.dahua", "大华模块", "ICC SDK 事件、门禁控制、通道缓存");
            ensureCategory("logging.category.aro", "ARO 同步", "人员数据同步、JTU API 调用");
            ensureCategory("logging.category.accessfusion", "门禁清洗", "原始事件摄入、方向推断、数据融合（默认关闭）");
            ensureCategory("logging.category.sql", "SQL 语句", "MyBatis SQL 日志（默认关闭，排查问题时临时开启）");
            ensureCategory("logging.category.request", "请求流量", "HTTP 请求体/参数日志（默认关闭，排查问题时临时开启）");
        } catch (Exception e) {
            log.warn("[logging] 配置定义初始化跳过: {}", e.getMessage());
        }
    }

    private void ensureCategory(String configKey, String labelZh, String description) {
        ensureDef("logging", configKey, labelZh, description, "BOOLEAN", null, "true", 0, 0, 0);
    }

    private void ensureDef(
            String module,
            String configKey,
            String labelZh,
            String description,
            String valueType,
            String optionsJson,
            String defaultValue,
            int isSensitive,
            int requiresRestart,
            int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class, module, configKey);
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                        """,
                module, configKey, labelZh, description, valueType, optionsJson, defaultValue,
                isSensitive, requiresRestart, isPublic);
        log.info("[logging] 已插入配置定义: {}.{}", module, configKey);
    }
}
