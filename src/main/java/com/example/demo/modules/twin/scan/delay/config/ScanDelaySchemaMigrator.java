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
        } catch (Exception e) {
            log.warn("[scan-delay] schema migrate skip: {}", e.getMessage());
        }
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
