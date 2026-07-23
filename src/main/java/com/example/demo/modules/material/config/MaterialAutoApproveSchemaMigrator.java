package com.example.demo.modules.material.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@Order(129)
public class MaterialAutoApproveSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(MaterialAutoApproveSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public MaterialAutoApproveSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_auto_trust (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    owner_user_id VARCHAR(64) NOT NULL,
                    subject_user_id VARCHAR(64) NOT NULL,
                    item_id BIGINT NOT NULL,
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    trigger_mode VARCHAR(20) NOT NULL DEFAULT 'ON_SUBMIT',
                    schedule_cron VARCHAR(64) NULL,
                    note VARCHAR(255) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_mat_trust (owner_user_id, subject_user_id, item_id),
                    KEY idx_mat_trust_owner (owner_user_id, enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_auto_batch (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    owner_user_id VARCHAR(64) NOT NULL,
                    name VARCHAR(128) NOT NULL DEFAULT '批量自动审批',
                    item_ids JSON NOT NULL,
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    schedule_cron VARCHAR(64) NOT NULL DEFAULT '0 */15 * * * *',
                    max_per_run INT NOT NULL DEFAULT 20,
                    only_if_reviewer_match TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_mat_batch_owner (owner_user_id, enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_auto_approve_log (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    rule_type VARCHAR(16) NOT NULL,
                    rule_id BIGINT NULL,
                    request_id VARCHAR(32) NOT NULL,
                    result VARCHAR(32) NOT NULL,
                    message VARCHAR(255) NULL,
                    executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_mat_auto_log_req (request_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        } catch (Exception e) {
            log.warn("[material-auto] schema migrate skip: {}", e.getMessage());
        }
    }
}
