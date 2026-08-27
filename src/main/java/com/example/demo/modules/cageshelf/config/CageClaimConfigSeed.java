package com.example.demo.modules.cageshelf.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 认领系统配置项播种 — 首次启动时写入 sys_system_config_def。
 * 列名与 {@link com.example.demo.common.bootstrap.CredentialsConfigSeed} 对齐，
 * 供「设置中心」schema 驱动读写（BOOLEAN→开关、STRING+options→下拉、NUMBER→数字框）。
 */
@Component
@Order(131)
public class CageClaimConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageClaimConfigSeed.class);
    private final JdbcTemplate jdbc;

    public CageClaimConfigSeed(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 历史开发期播种的「假配置」——非需求，除「是否到位确认」外全部删除（含已落库的定义）
            String[] fakeKeys = {
                "cage.claim.approval_mode",
                "cage.release.approval_mode",
                "cage.transfer.approval_mode",
                "cage.claim.approval_timeout_hours",
                "cage.claim.confirm_timeout_hours",
                "cage.claim.reject_cooldown_minutes",
                "cage.claim.max_reject_count",
            };
            for (String key : fakeKeys) {
                jdbc.update("DELETE FROM sys_system_config_def WHERE module = 'cage_claim' AND config_key = ?", key);
            }
            String boolOpts = "[\"true\",\"false\"]";
            def("cage_claim", "cage.claim.confirm_required", "是否需要到位确认",
                    "开启后认领需到场确认（locked），扫码确认到位后转 confirmed", "BOOLEAN",
                    boolOpts, "true");
            // 默认开启到位确认：历史环境若仍停留在旧的默认 false，翻转为 true（审核通过 → locked 待确认，而非直接已到位）。
            // 仅当该配置从未被人工改过（无 audit 记录）时翻转，避免覆盖管理员显式关闭的选择。
            jdbc.update("UPDATE sys_system_config sc SET sc.config_value = 'true', sc.update_time = NOW() " +
                    "WHERE sc.module = 'cage_claim' AND sc.config_key = 'cage.claim.confirm_required' " +
                    "AND sc.config_value = 'false' " +
                    "AND NOT EXISTS (SELECT 1 FROM sys_system_config_audit a " +
                    "               WHERE a.module = 'cage_claim' AND a.config_key = 'cage.claim.confirm_required')");
            log.info("[cage-claim-config] 仅保留 confirm_required 配置（默认开启到位确认），其余假配置已清理");
        } catch (Exception e) {
            log.warn("[cage-claim-config] 播种跳过: {}", e.getMessage());
        }
    }

    private void def(String module, String configKey, String labelZh, String description,
                     String valueType, String optionsJson, String defaultValue) {
        try {
            Integer exists = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                    Integer.class, module, configKey);
            if (exists != null && exists > 0) return;
            jdbc.update("""
                    INSERT INTO sys_system_config_def
                    (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NOW())
                    """,
                    module, configKey, labelZh, description, valueType, optionsJson, defaultValue);
        } catch (Exception e) {
            // 表可能不存在或列名不同，静默跳过（与 CredentialsConfigSeed 一致）
            log.warn("[cage-claim-config] 配置定义播种失败 {}.{}: {}", module, configKey, e.getMessage());
        }
    }
}
