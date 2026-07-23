package com.example.demo.modules.reportform.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * 填报记录多份子文件：幂等补列 {@code instance_label} 并迁移唯一索引。
 * 与 {@code scripts/report_form_submission_instance.ddl.sql} 同源，应用启动自动执行，无需手工跑 SQL。
 */
@Component
@Order(131)
public class ReportFormSubmissionSchemaMigrator {

    private static final Logger log = LoggerFactory.getLogger(ReportFormSubmissionSchemaMigrator.class);

    private static final String TABLE = "report_form_submission";
    private static final String COL = "instance_label";
    private static final String OLD_UK = "uk_form_user";
    private static final String NEW_UK = "uk_form_user_instance";

    private final JdbcTemplate jdbcTemplate;

    public ReportFormSubmissionSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        if (!tableExists(TABLE)) {
            log.debug("[report-form-schema] {} 不存在，跳过 instance_label 迁移（将由 bootstrap 建表）", TABLE);
            return;
        }
        ensureInstanceLabelColumn();
        ensureInstanceUniqueIndex();
    }

    private boolean tableExists(String tableName) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                    Integer.class, tableName);
            return cnt != null && cnt > 0;
        } catch (Exception e) {
            log.warn("[report-form-schema] 检测表 {} 失败: {}", tableName, e.getMessage());
            return false;
        }
    }

    private void ensureInstanceLabelColumn() {
        if (columnExists(TABLE, COL)) {
            log.debug("[report-form-schema] {}.{} 已存在", TABLE, COL);
            return;
        }
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE report_form_submission "
                            + "ADD COLUMN instance_label VARCHAR(255) NOT NULL DEFAULT '' "
                            + "COMMENT '个人多份填报子文件名称，空=默认单份' AFTER user_id");
            log.info("[report-form-schema] 已添加 {}.{}", TABLE, COL);
        } catch (Exception e) {
            log.warn("[report-form-schema] 添加 {}.{} 失败: {}", TABLE, COL, e.getMessage());
        }
    }

    private void ensureInstanceUniqueIndex() {
        if (indexExists(TABLE, NEW_UK)) {
            log.debug("[report-form-schema] 索引 {} 已存在", NEW_UK);
            return;
        }
        if (indexExists(TABLE, OLD_UK)) {
            try {
                jdbcTemplate.execute("ALTER TABLE report_form_submission DROP INDEX uk_form_user");
                log.info("[report-form-schema] 已删除旧索引 {}", OLD_UK);
            } catch (Exception e) {
                log.warn("[report-form-schema] 删除旧索引 {} 失败: {}", OLD_UK, e.getMessage());
            }
        }
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE report_form_submission "
                            + "ADD UNIQUE KEY uk_form_user_instance (form_id, user_id, instance_label)");
            log.info("[report-form-schema] 已创建索引 {}", NEW_UK);
        } catch (Exception e) {
            log.warn("[report-form-schema] 创建索引 {} 失败: {}", NEW_UK, e.getMessage());
        }
    }

    private boolean columnExists(String tableName, String colName) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, tableName, colName);
            return cnt != null && cnt > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean indexExists(String tableName, String indexName) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.STATISTICS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
                    Integer.class, tableName, indexName);
            return cnt != null && cnt > 0;
        } catch (Exception e) {
            return false;
        }
    }
}
