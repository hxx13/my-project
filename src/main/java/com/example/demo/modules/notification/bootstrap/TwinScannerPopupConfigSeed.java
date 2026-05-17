package com.example.demo.modules.notification.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 扫码弹窗进入/离开成功居中提示（模块 twin_scanner_popup）。
 * 配置对前端公开（is_public=1），在「系统设置」中编辑。
 */
@Component
@Order(121)
public class TwinScannerPopupConfigSeed implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(TwinScannerPopupConfigSeed.class);
    private static final String MODULE = "twin_scanner_popup";

    private final JdbcTemplate jdbcTemplate;

    public TwinScannerPopupConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureDef(
                    "scanner.access.notice.enabled",
                    "启用进出成功提示",
                    "关闭后扫码进入/离开成功不再显示居中提示。",
                    "BOOLEAN",
                    null,
                    "true",
                    1
            );
            ensureDef(
                    "scanner.access.notice.duration_ms",
                    "提示自动关闭（毫秒）",
                    "居中提示显示时长，到期自动消失。",
                    "NUMBER",
                    null,
                    "3000",
                    1
            );
            ensureDef(
                    "scanner.access.enter.own_text",
                    "进入成功·自带校园卡",
                    "自带校园卡进入成功后的居中提示文案，支持多行。",
                    "STRING",
                    null,
                    "您已进入",
                    1
            );
            ensureDef(
                    "scanner.access.enter.borrowed_text",
                    "进入成功·领用公卡",
                    "领用公卡进入成功后的居中提示文案，支持多行。",
                    "STRING",
                    null,
                    "您已进入",
                    1
            );
            ensureDef(
                    "scanner.access.exit.own_text",
                    "离开成功·自带校园卡",
                    "自带校园卡离开动画结束并切回按钮后的居中提示文案，支持多行。",
                    "STRING",
                    null,
                    "您已离开",
                    1
            );
            ensureDef(
                    "scanner.access.exit.borrowed_text",
                    "离开成功·领用公卡",
                    "领用公卡离开动画结束并切回按钮后的居中提示文案，支持多行。",
                    "STRING",
                    null,
                    "您已离开",
                    1
            );
        } catch (Exception e) {
            log.warn("[twin_scanner_popup] 配置定义初始化跳过: {}", e.getMessage());
        }
    }

    private void ensureDef(
            String configKey,
            String labelZh,
            String description,
            String valueType,
            String optionsJson,
            String defaultValue,
            int isPublic
    ) {
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
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NOW())
                        """,
                MODULE,
                configKey,
                labelZh,
                description,
                valueType,
                optionsJson,
                defaultValue,
                isPublic
        );
        log.info("[twin_scanner_popup] 已插入配置定义: {}.{}", MODULE, configKey);
    }
}
