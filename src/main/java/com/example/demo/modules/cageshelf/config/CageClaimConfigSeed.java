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
            seed("cage_claim", "cage.claim.approval_mode", "pi",
                    "认领审批模式: none/pi/admin/dual");
            seed("cage_claim", "cage.claim.confirm_required", "false",
                    "是否需要到场确认");
            seed("cage_claim", "cage.release.approval_mode", "follow_claim",
                    "释放审批模式: follow_claim/none/pi/admin");
            seed("cage_claim", "cage.transfer.approval_mode", "pi",
                    "转移审批模式: none/pi/admin");
            seed("cage_claim", "cage.claim.approval_timeout_hours", "72",
                    "pending_approval 超时自动 rejected（小时）");
            seed("cage_claim", "cage.claim.confirm_timeout_hours", "168",
                    "locked 超时自动 cancelled（小时）");
            seed("cage_claim", "cage.claim.reject_cooldown_minutes", "5",
                    "驳回后冷却时间（分钟）");
            seed("cage_claim", "cage.claim.max_reject_count", "3",
                    "同一学生同一笼位最大驳回次数");
            log.info("[cage-claim-config] 8 个配置项已播种");
        } catch (Exception e) {
            log.warn("[cage-claim-config] 播种跳过: {}", e.getMessage());
        }
    }

    private void seed(String module, String key, String defaultValue, String description) {
        try {
            Integer exists = jdbc.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE config_key = ?", Integer.class, key);
            if (exists != null && exists > 0) return;
            jdbc.update(
                "INSERT INTO sys_system_config_def (config_key, config_name, module, default_value, description, create_time) " +
                "VALUES (?, ?, ?, ?, ?, NOW())",
                key, key, module, defaultValue, description);
        } catch (Exception e) {
            // 表可能不存在或列名不同，静默跳过
        }
    }
}
