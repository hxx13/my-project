package com.example.demo.modules.twin.scan.delay.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@Order(128)
public class ScanDelayAutoApproveSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(ScanDelayAutoApproveSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public ScanDelayAutoApproveSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        migrateInline();
    }

    private void migrateInline() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_auto_trust (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    owner_user_id VARCHAR(64) NOT NULL,
                    subject_user_id VARCHAR(64) NOT NULL,
                    option_id BIGINT NOT NULL,
                    room_id VARCHAR(64) NULL,
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    trigger_mode VARCHAR(20) NOT NULL DEFAULT 'ON_SUBMIT',
                    schedule_cron VARCHAR(64) NULL,
                    note VARCHAR(255) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_sd_trust (owner_user_id, subject_user_id, option_id, room_id),
                    KEY idx_sd_trust_owner (owner_user_id, enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_auto_batch (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    owner_user_id VARCHAR(64) NOT NULL,
                    name VARCHAR(128) NOT NULL DEFAULT '批量自动审批',
                    option_ids JSON NOT NULL,
                    room_ids JSON NULL,
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    schedule_cron VARCHAR(64) NOT NULL DEFAULT '0 */15 * * * *',
                    max_per_run INT NOT NULL DEFAULT 20,
                    only_if_reviewer_match TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_sd_batch_owner (owner_user_id, enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_auto_approve_log (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    rule_type VARCHAR(16) NOT NULL,
                    rule_id BIGINT NULL,
                    request_id BIGINT NOT NULL,
                    result VARCHAR(32) NOT NULL,
                    message VARCHAR(255) NULL,
                    executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_sd_auto_log_req (request_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        } catch (Exception e) {
            log.warn("[scan-delay-auto] schema migrate skip: {}", e.getMessage());
        }
    }
}
