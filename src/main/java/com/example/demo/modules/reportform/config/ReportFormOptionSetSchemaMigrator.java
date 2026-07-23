package com.example.demo.modules.reportform.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * 选项集按账号体系与创建人隔离：幂等补列 {@code created_by}、{@code auth_profile}。
 * 与 {@code scripts/report_form_option_set_auth.ddl.sql} 同源。
 */
@Component
@Order(132)
public class ReportFormOptionSetSchemaMigrator {

    private static final Logger log = LoggerFactory.getLogger(ReportFormOptionSetSchemaMigrator.class);
    private static final String TABLE = "report_form_option_set";

    private final JdbcTemplate jdbcTemplate;

    public ReportFormOptionSetSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        if (!tableExists(TABLE)) {
            log.debug("[report-form-option-set] {} 不存在，跳过迁移", TABLE);
            return;
        }
        ensureColumn("created_by",
                "ALTER TABLE report_form_option_set ADD COLUMN created_by VARCHAR(64) NULL "
                        + "COMMENT '创建人登录名' AFTER items_json");
        ensureColumn("auth_profile",
                "ALTER TABLE report_form_option_set ADD COLUMN auth_profile VARCHAR(32) NULL "
                        + "COMMENT '账号体系: WECHAT_ARO|WEB_PASSWORD' AFTER created_by");
        ensureIndex("idx_opt_auth_profile", "CREATE INDEX idx_opt_auth_profile ON report_form_option_set (auth_profile)");
        ensureIndex("idx_opt_created_by", "CREATE INDEX idx_opt_created_by ON report_form_option_set (created_by)");
    }

    private boolean tableExists(String tableName) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, tableName);
            return cnt != null && cnt > 0;
        } catch (Exception e) {
            log.warn("[report-form-option-set] 检测表 {} 失败: {}", tableName, e.getMessage());
            return false;
        }
    }

    private void ensureColumn(String column, String ddl) {
        if (columnExists(column)) {
            return;
        }
        try {
            jdbcTemplate.execute(ddl);
            log.info("[report-form-option-set] added column {}", column);
        } catch (Exception e) {
            log.warn("[report-form-option-set] add column {} failed: {}", column, e.getMessage());
        }
    }

    private boolean columnExists(String column) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, TABLE, column);
            return cnt != null && cnt > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private void ensureIndex(String indexName, String ddl) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.STATISTICS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                    Integer.class, TABLE, indexName);
            if (cnt != null && cnt > 0) {
                return;
            }
            jdbcTemplate.execute(ddl);
            log.info("[report-form-option-set] added index {}", indexName);
        } catch (Exception e) {
            log.debug("[report-form-option-set] skip index {}: {}", indexName, e.getMessage());
        }
    }
}
