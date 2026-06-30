package com.example.demo.modules.twin.scan.delay.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@Order(127)
public class ScanDelaySchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(ScanDelaySchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public ScanDelaySchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_option (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    room_id VARCHAR(64) NOT NULL,
                    room_name VARCHAR(128) NOT NULL,
                    option_label VARCHAR(64) NOT NULL,
                    button_label VARCHAR(32) NOT NULL DEFAULT '延迟',
                    display_start VARCHAR(5) NULL,
                    display_end VARCHAR(5) NULL,
                    require_approval TINYINT(1) NOT NULL DEFAULT 0,
                    reviewer_user_ids JSON NULL,
                    exempt_mode VARCHAR(20) NOT NULL DEFAULT 'TIME',
                    duration_minutes INT NULL,
                    max_count INT NULL,
                    exempt_room_ids JSON NULL,
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_tsdo_room (room_id, enabled, sort_order)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_request (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    subject_user_id VARCHAR(64) NOT NULL,
                    card_no VARCHAR(64) NOT NULL,
                    room_id VARCHAR(64) NOT NULL,
                    option_id BIGINT NOT NULL,
                    duration_minutes INT NULL,
                    reviewer_user_id VARCHAR(64) NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    requested_by VARCHAR(64) NULL,
                    reviewed_by VARCHAR(64) NULL,
                    reviewed_at DATETIME NULL,
                    reject_reason VARCHAR(255) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_tsdr_status (status, created_at),
                    KEY idx_tsdr_reviewer (reviewer_user_id, status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_room_option (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    room_id VARCHAR(64) NOT NULL,
                    option_id BIGINT NOT NULL,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_sdro_room_option (room_id, option_id),
                    KEY idx_sdro_room (room_id, sort_order)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
            migrateLegacyRoomBindings();
            ensureExtendUntilTimeColumn();
            ensureCarrierSchema();
            ensureCarrierOptionSchema();
            ensureRoomCarrierSchema();
        } catch (Exception e) {
            log.warn("[scan-delay] schema migrate skip: {}", e.getMessage());
        }
    }

    private void ensureCarrierSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_carrier (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    button_label VARCHAR(32) NOT NULL DEFAULT '延迟',
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        Integer col = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_scan_delay_option'
                  AND COLUMN_NAME = 'carrier_id'
                """,
                Integer.class
        );
        if (col == null || col == 0) {
            jdbcTemplate.execute("""
                ALTER TABLE twin_scan_delay_option
                ADD COLUMN carrier_id BIGINT NULL COMMENT 'twin_scan_delay_carrier.id'
                AFTER id
                """);
            log.info("[scan-delay] added column carrier_id");
        }
        Integer orphan = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM twin_scan_delay_option WHERE carrier_id IS NULL",
                Integer.class
        );
        if (orphan != null && orphan > 0) {
            jdbcTemplate.update("""
                INSERT INTO twin_scan_delay_carrier (button_label, enabled, sort_order)
                SELECT DISTINCT TRIM(button_label), 1, 0 FROM twin_scan_delay_option
                WHERE carrier_id IS NULL AND TRIM(button_label) <> ''
                """);
            jdbcTemplate.update("""
                UPDATE twin_scan_delay_option o
                INNER JOIN twin_scan_delay_carrier c ON c.button_label = TRIM(o.button_label)
                SET o.carrier_id = c.id
                WHERE o.carrier_id IS NULL
                """);
            Integer carriers = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM twin_scan_delay_carrier",
                    Integer.class
            );
            if (carriers != null && carriers == 0) {
                jdbcTemplate.update("INSERT INTO twin_scan_delay_carrier (button_label, enabled, sort_order) VALUES ('延迟', 1, 0)");
            }
            jdbcTemplate.update("""
                UPDATE twin_scan_delay_option
                SET carrier_id = (SELECT id FROM (SELECT id FROM twin_scan_delay_carrier ORDER BY id ASC LIMIT 1) t)
                WHERE carrier_id IS NULL
                """);
            log.info("[scan-delay] migrated {} orphan options to carriers", orphan);
        }
    }

    private void ensureCarrierOptionSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_carrier_option (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    carrier_id BIGINT NOT NULL,
                    option_id BIGINT NOT NULL,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_sdco_carrier_option (carrier_id, option_id),
                    KEY idx_sdco_carrier (carrier_id, sort_order),
                    KEY idx_sdco_option (option_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM twin_scan_delay_carrier_option",
                Integer.class
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        int migrated = jdbcTemplate.update("""
                INSERT IGNORE INTO twin_scan_delay_carrier_option (carrier_id, option_id, sort_order)
                SELECT carrier_id, id, sort_order FROM twin_scan_delay_option
                WHERE carrier_id IS NOT NULL
                """);
        if (migrated > 0) {
            log.info("[scan-delay] migrated {} carrier-option assignments from option.carrier_id", migrated);
        }
    }

    private void ensureRoomCarrierSchema() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_scan_delay_room_carrier (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    room_id VARCHAR(64) NOT NULL,
                    carrier_id BIGINT NOT NULL,
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_sdrc_room_carrier (room_id, carrier_id),
                    KEY idx_sdrc_room (room_id, sort_order)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM twin_scan_delay_room_carrier",
                Integer.class
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        int migrated = jdbcTemplate.update("""
                INSERT IGNORE INTO twin_scan_delay_room_carrier (room_id, carrier_id, sort_order)
                SELECT DISTINCT ro.room_id, o.carrier_id, 0
                FROM twin_scan_delay_room_option ro
                INNER JOIN twin_scan_delay_option o ON o.id = ro.option_id
                WHERE o.carrier_id IS NOT NULL
                """);
        if (migrated > 0) {
            log.info("[scan-delay] migrated {} room-carrier bindings from room_option", migrated);
        }
    }

    private void ensureExtendUntilTimeColumn() {
        Integer cnt = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_scan_delay_option'
                  AND COLUMN_NAME = 'extend_until_time'
                """,
                Integer.class
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.execute("""
            ALTER TABLE twin_scan_delay_option
            ADD COLUMN extend_until_time VARCHAR(5) NULL
              COMMENT '豁免延长至当日 HH:mm（优先于 duration_minutes）'
              AFTER duration_minutes
            """);
        log.info("[scan-delay] added column extend_until_time");
    }

    /** 旧版 option.room_id 直绑 → 房间搭配表（幂等） */
    private void migrateLegacyRoomBindings() {
        Integer junctionCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM twin_scan_delay_room_option",
                Integer.class
        );
        if (junctionCount != null && junctionCount > 0) {
            return;
        }
        int migrated = jdbcTemplate.update("""
                INSERT IGNORE INTO twin_scan_delay_room_option (room_id, option_id, sort_order)
                SELECT room_id, id, sort_order FROM twin_scan_delay_option
                WHERE room_id IS NOT NULL AND TRIM(room_id) <> ''
                """);
        if (migrated > 0) {
            log.info("[scan-delay] migrated {} legacy room-option bindings", migrated);
        }
    }
}
