package com.example.demo.modules.twin.scan.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@Order(128)
public class ScanNoticeAutoSuppressSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(ScanNoticeAutoSuppressSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public ScanNoticeAutoSuppressSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_notice_auto_suppress (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    target_user_id VARCHAR(64) NOT NULL COMMENT '被扫码人员 ARO user_id',
                    notice_kind VARCHAR(20) NOT NULL COMMENT 'violation|unbound|announcement',
                    record_id BIGINT NOT NULL COMMENT '违规/公告 id；未绑卡固定 1',
                    source_updated_at DATETIME NULL COMMENT 'suppress 时被扫通告 updated_at 快照',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_tsna_suppress (target_user_id, notice_kind, record_id),
                    KEY idx_tsna_target (target_user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码通告：被扫人员下次不再自动弹出'
                """);
            ensureColumn(
                    "twin_scan_notice_auto_suppress",
                    "source_updated_at",
                    "ALTER TABLE twin_scan_notice_auto_suppress ADD COLUMN source_updated_at DATETIME NULL COMMENT 'suppress 时被扫通告 updated_at 快照' AFTER record_id"
            );
        } catch (Exception e) {
            log.warn("[scan-notice-suppress] schema migrate skip: {}", e.getMessage());
        }
    }

    private void ensureColumn(String tableName, String columnName, String alterSql) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS " +
                            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class,
                    tableName,
                    columnName
            );
            if (cnt != null && cnt > 0) {
                return;
            }
            jdbcTemplate.execute(alterSql);
            log.info("[scan-notice-suppress] 已补齐字段: {}.{}", tableName, columnName);
        } catch (Exception e) {
            log.warn("[scan-notice-suppress] 字段补齐失败 {}.{}: {}", tableName, columnName, e.getMessage());
        }
    }
}
