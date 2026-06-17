package com.example.demo.modules.twin.scan.delay.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 大华发卡页：扫码延迟免冻结总开关（模块 twin_dahua_issue）。
 */
@Component
@Order(123)
public class DahuaIssueScanDelayConfigSeed implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DahuaIssueScanDelayConfigSeed.class);
    public static final String MODULE = "twin_dahua_issue";
    public static final String KEY_ENABLED = "scanner.delay.enabled";
    public static final String KEY_BUTTON_LABEL = "scanner.delay.button_label";

    private final JdbcTemplate jdbcTemplate;

    public DahuaIssueScanDelayConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            migrateModuleIfLegacy();
            ensureDef(
                    KEY_ENABLED,
                    "启用扫码延迟免冻结",
                    "在大华发卡页配置房间延迟菜单；关闭后扫码弹窗不显示延迟按钮。",
                    "BOOLEAN",
                    "false",
                    0
            );
            ensureConfigValue(KEY_ENABLED, "false");
            ensureDef(
                    KEY_BUTTON_LABEL,
                    "延迟按钮文案",
                    "扫码弹窗进入按钮旁公用「延迟」载体按钮的显示文字。",
                    "STRING",
                    "延迟",
                    0
            );
            ensureConfigValue(KEY_BUTTON_LABEL, "延迟");
        } catch (Exception e) {
            log.warn("[twin_dahua_issue] scan delay config seed skip: {}", e.getMessage());
        }
    }

    /** 从 twin_scanner_popup 迁移至本模块（幂等） */
    private void migrateModuleIfLegacy() {
        jdbcTemplate.update(
                "UPDATE sys_system_config_def SET module = ? WHERE config_key = ? AND module = 'twin_scanner_popup'",
                MODULE, KEY_ENABLED
        );
        jdbcTemplate.update(
                "UPDATE sys_system_config SET module = ? WHERE config_key = ? AND module = 'twin_scanner_popup'",
                MODULE, KEY_ENABLED
        );
    }

    private void ensureDef(String configKey, String labelZh, String description, String valueType, String defaultValue, int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class,
                MODULE,
                configKey
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 0, ?, NOW())
                        """,
                MODULE,
                configKey,
                labelZh,
                description,
                valueType,
                defaultValue,
                isPublic
        );
        log.info("[twin_dahua_issue] inserted config def: {}.{}", MODULE, configKey);
    }

    private void ensureConfigValue(String configKey, String defaultValue) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config WHERE module = ? AND config_key = ?",
                Integer.class,
                MODULE,
                configKey
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO sys_system_config (module, config_key, config_value, update_time) VALUES (?, ?, ?, NOW())",
                MODULE,
                configKey,
                defaultValue
        );
    }
}
