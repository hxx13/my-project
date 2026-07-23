package com.example.demo.common.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 启动时自动注册 Turnstile 系统配置定义（幂等）。
 * 注册后可在「系统设置 → 平台与网络 → Turnstile 人机验证」中修改。
 */
@Component
@Order(105)
public class TurnstileConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(TurnstileConfigSeed.class);
    private final JdbcTemplate jdbc;

    public TurnstileConfigSeed(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("TurnstileConfigSeed: 注册 Turnstile 配置定义");
        def("turnstile", "turnstile.enabled",
                "启用 Turnstile 验证",
                "登录页人机验证开关。关闭后仅账号锁定保护生效",
                "BOOLEAN", "[\"true\",\"false\"]", "false", 0, 0, 1);
        def("turnstile", "turnstile.site-key",
                "Turnstile Site Key",
                "Cloudflare Turnstile 站点密钥（公开）。在 Cloudflare Dashboard → Turnstile 中获取",
                "STRING", null, "", 0, 0, 1);
        def("turnstile", "turnstile.secret-key",
                "Turnstile Secret Key",
                "Cloudflare Turnstile 密钥（私密）。在 Cloudflare Dashboard → Turnstile 中获取",
                "STRING", null, "", 1, 0, 0);
        log.info("TurnstileConfigSeed: 注册完成");
    }

    private void def(String module, String configKey, String labelZh, String description,
                     String valueType, String optionsJson, String defaultValue,
                     int isSensitive, int requiresRestart, int isPublic) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class, module, configKey);
        if (count != null && count > 0) {
            return;
        }
        jdbc.update(
                "INSERT INTO sys_system_config_def (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                module, configKey, labelZh, description, valueType, optionsJson, defaultValue,
                isSensitive, requiresRestart, isPublic);
        log.info("TurnstileConfigSeed: 已注册 {}.{}", module, configKey);
    }
}
