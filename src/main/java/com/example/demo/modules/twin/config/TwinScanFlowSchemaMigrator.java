package com.example.demo.modules.twin.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 启动时补齐流水表历史字段，兼容旧库与新代码并存场景。
 */
@Component
public class TwinScanFlowSchemaMigrator {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PostConstruct
    public void migrate() {
        ensureColumn(
                "is_enter_unexited",
                "ALTER TABLE aro_access_log ADD COLUMN is_enter_unexited TINYINT NOT NULL DEFAULT 0 COMMENT '进入未离开标志(ENTER=1, EXIT后清零)'"
        );
        ensureColumn(
                "exempt_at_exit",
                "ALTER TABLE aro_access_log ADD COLUMN exempt_at_exit TINYINT NOT NULL DEFAULT 0 COMMENT '离开时刻豁免快照(仅EXIT)'"
        );
    }

    private void ensureColumn(String columnName, String alterSql) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS " +
                            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aro_access_log' AND COLUMN_NAME = ?",
                    Integer.class,
                    columnName
            );
            if (cnt != null && cnt > 0) {
                return;
            }
            jdbcTemplate.execute(alterSql);
            System.out.println("✅ [SchemaMigrator] 已补齐字段: aro_access_log." + columnName);
        } catch (Exception e) {
            System.err.println("❌ [SchemaMigrator] 字段补齐失败 " + columnName + ": " + e.getMessage());
        }
    }
}
