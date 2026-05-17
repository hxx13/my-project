package com.example.demo.modules.twin.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.example.demo.modules.twin.service.ScanCampusEnterConfigService;

/**
 * 系统设置 → 扫码终端：浦东/浦西进入禁用开关（sys_system_config_def）。
 */
@Component
public class ScanCampusConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ScanCampusConfigSeed.class);

    private final JdbcTemplate jdbcTemplate;

    public ScanCampusConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            insertDefIfAbsent(
                    ScanCampusEnterConfigService.KEY_BLOCK_PUDONG,
                    "禁用浦东校区进入",
                    "开启后，扫码弹窗中属于浦东校区的房间「进入」按钮不可点，按钮提示为「不在此校区」。",
                    "false"
            );
            insertDefIfAbsent(
                    ScanCampusEnterConfigService.KEY_BLOCK_PUXI,
                    "禁用浦西校区进入",
                    "开启后，扫码弹窗中属于浦西校区的房间「进入」按钮不可点，按钮提示为「不在此校区」。",
                    "false"
            );
            ensureConfigValue(ScanCampusEnterConfigService.KEY_BLOCK_PUDONG, "false");
            ensureConfigValue(ScanCampusEnterConfigService.KEY_BLOCK_PUXI, "false");
        } catch (Exception e) {
            log.warn("[scan-campus-config] 初始化跳过: {}", e.getMessage());
        }
    }

    private void insertDefIfAbsent(String configKey, String labelZh, String description, String defaultValue) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class,
                ScanCampusEnterConfigService.MODULE,
                configKey
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, 'boolean', NULL, ?, 0, 0, 0, NOW())
                        """,
                ScanCampusEnterConfigService.MODULE,
                configKey,
                labelZh,
                description,
                defaultValue
        );
        log.info("[scan-campus-config] 已插入配置定义: {}.{}", ScanCampusEnterConfigService.MODULE, configKey);
    }

    private void ensureConfigValue(String configKey, String defaultValue) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config WHERE module = ? AND config_key = ?",
                Integer.class,
                ScanCampusEnterConfigService.MODULE,
                configKey
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config (module, config_key, config_value, update_time)
                        VALUES (?, ?, ?, NOW())
                        """,
                ScanCampusEnterConfigService.MODULE,
                configKey,
                defaultValue
        );
    }
}
