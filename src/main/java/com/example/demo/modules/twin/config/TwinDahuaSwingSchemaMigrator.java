package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@Order(127)
public class TwinDahuaSwingSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(TwinDahuaSwingSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public TwinDahuaSwingSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        safeExecute("""
                CREATE TABLE IF NOT EXISTS twin_dahua_pull_task (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(128) NOT NULL,
                    enabled TINYINT NOT NULL DEFAULT 1,
                    poll_interval_seconds INT NOT NULL DEFAULT 60,
                    query_json TEXT NOT NULL,
                    activation_rules_json TEXT NULL,
                    last_cursor_time DATETIME NULL,
                    last_status VARCHAR(32) NULL,
                    last_error TEXT NULL,
                    last_run_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_task_enabled (enabled),
                    KEY idx_task_updated (updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """);

        safeExecute("""
                CREATE TABLE IF NOT EXISTS twin_dahua_swing_record (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    task_id BIGINT NOT NULL,
                    record_id VARCHAR(64) NOT NULL,
                    card_number VARCHAR(64) NULL,
                    card_status INT NULL,
                    channel_code VARCHAR(128) NULL,
                    channel_name VARCHAR(255) NULL,
                    open_type INT NULL,
                    person_code VARCHAR(64) NULL,
                    person_id BIGINT NULL,
                    person_name VARCHAR(128) NULL,
                    swing_time DATETIME NULL,
                    create_time DATETIME NULL,
                    open_result INT NULL,
                    enter_or_exit INT NULL,
                    mapping_user_id VARCHAR(64) NULL,
                    mapping_card_no VARCHAR(64) NULL,
                    mapping_hit TINYINT NOT NULL DEFAULT 0,
                    freeze_exempt_flag INT NULL,
                    raw_json LONGTEXT NULL,
                    ingested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_dahua_record_id (record_id),
                    KEY idx_dahua_task (task_id),
                    KEY idx_dahua_card_num (card_number),
                    KEY idx_dahua_card_status (card_status),
                    KEY idx_dahua_channel_code_time (channel_code, swing_time),
                    KEY idx_dahua_channel_name (channel_name),
                    KEY idx_dahua_open_type_time (open_type, swing_time),
                    KEY idx_dahua_person_code_time (person_code, swing_time),
                    KEY idx_dahua_person_id_time (person_id, swing_time),
                    KEY idx_dahua_person_name (person_name),
                    KEY idx_dahua_swing_time (swing_time),
                    KEY idx_dahua_create_time (create_time)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """);

        safeExecute("""
                CREATE TABLE IF NOT EXISTS twin_dahua_activation_state (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    task_id BIGINT NOT NULL,
                    user_id VARCHAR(64) NOT NULL,
                    channel_code VARCHAR(128) NOT NULL,
                    state VARCHAR(32) NOT NULL,
                    counter INT NOT NULL DEFAULT 0,
                    activated_at DATETIME NULL,
                    last_swipe_at DATETIME NULL,
                    scheduled_exit_at DATETIME NULL,
                    debounce_until DATETIME NULL,
                    last_record_id VARCHAR(64) NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_activation_user_channel (task_id, user_id, channel_code),
                    KEY idx_activation_state (state),
                    KEY idx_activation_schedule (scheduled_exit_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """);
        safeExecute("""
                CREATE TABLE IF NOT EXISTS twin_dahua_rule_config (
                    id TINYINT PRIMARY KEY,
                    config_json LONGTEXT NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """);
        safeExecute("INSERT IGNORE INTO twin_dahua_rule_config (id, config_json) VALUES (1, '{}')");

        ensureColumnExists("twin_dahua_pull_task", "poll_interval_seconds",
                "ALTER TABLE twin_dahua_pull_task ADD COLUMN poll_interval_seconds INT NOT NULL DEFAULT 60");
        log.info("[twin-dahua-swing-schema] 表结构已就绪");
    }

    private void safeExecute(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            log.error("[twin-dahua-swing-schema] SQL执行失败: {}", e.getMessage());
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                    Integer.class, tableName, columnName
            );
            if (cnt == null || cnt <= 0) {
                safeExecute(alterSql);
            }
        } catch (Exception e) {
            log.error("[twin-dahua-swing-schema] 检查字段失败 table={}, column={}, err={}", tableName, columnName, e.getMessage());
        }
    }
}
