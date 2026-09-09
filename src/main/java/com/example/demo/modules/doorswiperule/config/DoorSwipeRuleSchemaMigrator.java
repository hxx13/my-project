package com.example.demo.modules.doorswiperule.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

/**
 * 门禁成功刷卡规则（door-swipe-rules）建表迁移。
 *
 * <p>镜像 {@code DoorTempUnlockSchemaMigrator}（@PostConstruct 幂等建表）+ {@code TwinDahuaSwingSchemaMigrator}
 * （ensureColumn 补列）。只走启动链自动建表，不另立 V*.sql / bootstrap 一套 —— 与「门禁临时解锁」同款机制。</p>
 */
@Component
@Order(129)
public class DoorSwipeRuleSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(DoorSwipeRuleSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public DoorSwipeRuleSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        safeExecute("""
                CREATE TABLE IF NOT EXISTS door_swipe_rule_config (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(128) NOT NULL,
                    enabled TINYINT NOT NULL DEFAULT 1,
                    channel_codes TEXT NULL COMMENT 'JSON数组，规则绑定的通道编号列表',
                    scope_type VARCHAR(32) NOT NULL DEFAULT 'ALL' COMMENT 'ALL|PERSON|DEPARTMENT|CARD',
                    scope_values TEXT NULL COMMENT 'JSON数组，人员范围值列表',
                    threshold_count INT NOT NULL DEFAULT 3 COMMENT '成功刷卡次数阈值',
                    threshold_window_sec INT NOT NULL DEFAULT 60 COMMENT '时间窗口(秒)',
                    stay_open_duration_sec INT NOT NULL DEFAULT 120 COMMENT '常开持续时长(秒)',
                    cooldown_sec INT NOT NULL DEFAULT 300 COMMENT '按人+门冷却时间(秒)',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_swipe_rule_enabled (enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁成功刷卡规则';
                """);

        safeExecute("""
                CREATE TABLE IF NOT EXISTS door_swipe_rule_channel_scope (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    channel_code VARCHAR(128) NOT NULL,
                    channel_name VARCHAR(255) NULL,
                    enabled TINYINT NOT NULL DEFAULT 1,
                    updated_by VARCHAR(64) NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_swipe_channel_code (channel_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁成功刷卡受控通道总闸';
                """);

        safeExecute("""
                CREATE TABLE IF NOT EXISTS door_swipe_rule_record (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    record_id VARCHAR(64) NOT NULL,
                    card_number VARCHAR(64) NULL,
                    channel_code VARCHAR(128) NULL,
                    channel_name VARCHAR(255) NULL,
                    open_type INT NULL,
                    person_code VARCHAR(64) NULL,
                    person_id BIGINT NULL,
                    person_name VARCHAR(128) NULL,
                    department_id VARCHAR(50) NULL,
                    swing_time DATETIME NULL,
                    create_time DATETIME NULL,
                    open_result INT NULL,
                    enter_or_exit INT NULL,
                    raw_json LONGTEXT NULL,
                    ingested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_swipe_record_id (record_id),
                    KEY idx_swipe_channel_time (channel_code, swing_time),
                    KEY idx_swipe_person_code (person_code),
                    KEY idx_swipe_open_type (open_type),
                    KEY idx_swipe_swing_time (swing_time)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁成功刷卡规则独立记录库(仅受控通道)';
                """);

        log.info("[door-swipe-rule-schema] 表结构已就绪");
    }

    private void safeExecute(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            log.error("[door-swipe-rule-schema] SQL执行失败: {}", e.getMessage());
        }
    }
}
