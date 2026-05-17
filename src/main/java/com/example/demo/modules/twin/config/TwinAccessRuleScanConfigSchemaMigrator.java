package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * 与 {@code AccessRuleSchemaMigrator} 类似：无 Flyway 时保证表存在，避免 {@link com.example.demo.modules.twin.service.TwinAccessRuleScanConfigService}
 * 在 {@code @PostConstruct} 插入默认行时报表不存在。
 */
@Component
public class TwinAccessRuleScanConfigSchemaMigrator {

    private static final Logger log = LoggerFactory.getLogger(TwinAccessRuleScanConfigSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public TwinAccessRuleScanConfigSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void createTableIfMissing() {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS twin_access_rule_scan_config (
                        id INT NOT NULL PRIMARY KEY COMMENT '固定 1 行全局配置',
                        enter_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码进入时执行门禁规则大华批量下发',
                        exit_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码离开时执行门禁规则大华权限回收',
                        enter_unfreeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码进入时解冻物理卡',
                        exit_freeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码/自动签退离开时冻结物理卡',
                        updated_by VARCHAR(64) NULL,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码进出是否执行门禁规则（大华联动）全局开关'
                    """);
            ensureColumnExists(
                    "twin_access_rule_scan_config",
                    "enter_unfreeze_enabled",
                    "ALTER TABLE twin_access_rule_scan_config ADD COLUMN enter_unfreeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码进入时解冻物理卡' AFTER exit_dispatch_enabled"
            );
            ensureColumnExists(
                    "twin_access_rule_scan_config",
                    "exit_freeze_enabled",
                    "ALTER TABLE twin_access_rule_scan_config ADD COLUMN exit_freeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码/自动签退离开时冻结物理卡' AFTER enter_unfreeze_enabled"
            );
            log.info("[twin-access-rule-scan-config-schema] 表已就绪");
        } catch (Exception e) {
            log.error("[twin-access-rule-scan-config-schema] 建表失败: {}", e.getMessage(), e);
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
                """,
                Integer.class,
                tableName,
                columnName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(alterSql);
        }
    }
}
