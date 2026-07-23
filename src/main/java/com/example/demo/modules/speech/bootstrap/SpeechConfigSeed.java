package com.example.demo.modules.speech.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 语音播报系统配置 Seed — 可视化开关。
 * 注册后可在 /admin/settings?module=speech 页面看到下拉开关。
 */
@Component
@Order(130)
public class SpeechConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SpeechConfigSeed.class);
    private static final String MODULE = "integration";

    private final JdbcTemplate jdbcTemplate;
    private final String defaultScanAutoPlay;

    public SpeechConfigSeed(
            JdbcTemplate jdbcTemplate,
            @Value("${app.speech.scan-auto-play:true}") String defaultScanAutoPlay) {
        this.jdbcTemplate = jdbcTemplate;
        this.defaultScanAutoPlay = defaultScanAutoPlay;
    }

    @Override
    public void run(org.springframework.boot.ApplicationArguments args) {
        ensureDef(MODULE, "speech.scan_auto_play",
                "扫码语音自动播报",
                "刷卡弹窗展示AI欢迎语时，自动朗读服务端预生成的语音。关闭后仅显示文字，不自动朗读。",
                "BOOLEAN", null, defaultScanAutoPlay,
                0, 0, 1); // isPublic=1 → 前端无需登录即可读取
        log.info("[speech] config defs seeded");
    }

    private void ensureDef(
            String module, String configKey, String labelZh, String description,
            String valueType, String optionsJson, String defaultValue,
            int isSensitive, int requiresRestart, int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class, module, configKey);
        if (cnt != null && cnt > 0) {
            jdbcTemplate.update(
                    "UPDATE sys_system_config_def SET label_zh = ?, description = ?, value_type = ?," +
                    " default_value = ? WHERE module = ? AND config_key = ?",
                    labelZh, description, valueType, defaultValue, module, configKey);
            return;
        }
        jdbcTemplate.update(
                "INSERT INTO sys_system_config_def (module, config_key, label_zh, description," +
                " value_type, options_json, default_value, is_sensitive, requires_restart, is_public)" +
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                module, configKey, labelZh, description, valueType, optionsJson, defaultValue,
                isSensitive, requiresRestart, isPublic);
    }
}
