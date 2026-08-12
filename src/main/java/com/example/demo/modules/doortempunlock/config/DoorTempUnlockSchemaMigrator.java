package com.example.demo.modules.doortempunlock.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@Order(128)
public class DoorTempUnlockSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(DoorTempUnlockSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public DoorTempUnlockSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        safeExecute("""
                CREATE TABLE IF NOT EXISTS door_temp_unlock_rule (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(128) NOT NULL,
                    enabled TINYINT NOT NULL DEFAULT 1,
                    channel_codes TEXT NULL COMMENT 'JSON数组，监控的通道编号列表',
                    threshold_count INT NOT NULL DEFAULT 3 COMMENT '失败次数阈值',
                    threshold_window_sec INT NOT NULL DEFAULT 60 COMMENT '时间窗口(秒)',
                    unlock_duration_sec INT NOT NULL DEFAULT 120 COMMENT '常开持续时长(秒)',
                    cooldown_sec INT NOT NULL DEFAULT 300 COMMENT '按人+门冷却时间(秒)',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_enabled (enabled)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁临时解锁规则';
                """);

        log.info("[door-temp-unlock-schema] 表结构已就绪");
    }

    private void safeExecute(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (Exception e) {
            log.error("[door-temp-unlock-schema] SQL执行失败: {}", e.getMessage());
        }
    }
}
