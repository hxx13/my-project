package com.example.demo.modules.notification.push.digest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(128)
public class DigestSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DigestSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public DigestSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS notify_digest_default_config (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    source_code VARCHAR(64) NOT NULL UNIQUE,
                    digest_mode VARCHAR(32) NOT NULL DEFAULT 'INSTANT',
                    schedule_times VARCHAR(128),
                    overflow_strategy VARCHAR(32) NOT NULL DEFAULT 'ROLL_OVER',
                    digest_title_tpl VARCHAR(255),
                    digest_content_tpl VARCHAR(2000),
                    enabled TINYINT NOT NULL DEFAULT 0,
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS user_digest_preference (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    source_code VARCHAR(64) NOT NULL,
                    digest_mode VARCHAR(32),
                    schedule_times VARCHAR(128),
                    overflow_strategy VARCHAR(32),
                    enabled TINYINT,
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_user_source (user_id, source_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS notify_digest_item (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    source_code VARCHAR(64) NOT NULL,
                    channel_code VARCHAR(32) NOT NULL,
                    title VARCHAR(500),
                    content TEXT,
                    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    send_time DATETIME,
                    INDEX idx_user_status (user_id, status),
                    INDEX idx_status_time (status, create_time)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """);

            // 新增列（幂等）
            for (String col : new String[]{
                "schedule_days VARCHAR(32) COMMENT '逗号分隔星期 1=周一 7=周日，空=每天'",
                "hourly_interval INT NOT NULL DEFAULT 1 COMMENT 'HOURLY 模式间隔小时数'",
                "night_mode_enabled TINYINT NOT NULL DEFAULT 0",
                "night_start VARCHAR(5) COMMENT '夜间开始 HH:mm'",
                "night_end VARCHAR(5) COMMENT '夜间结束 HH:mm'",
                "minutely_interval INT NOT NULL DEFAULT 5 COMMENT 'MINUTELY 模式间隔分钟数'",
                "overflow_cutoff_time VARCHAR(5) COMMENT 'FALLBACK_INSTANT 截止时间 HH:mm'"
            }) {
                try { jdbcTemplate.execute("ALTER TABLE notify_digest_default_config ADD COLUMN " + col); } catch (Exception e) { /* ok */ }
                try { jdbcTemplate.execute("ALTER TABLE user_digest_preference ADD COLUMN " + col.replace("NOT NULL DEFAULT 1", "")); } catch (Exception e) { /* ok */ }
            }
            try {
                jdbcTemplate.execute("""
                    ALTER TABLE notify_source_channel
                        ADD COLUMN digest_mode VARCHAR(32) NOT NULL DEFAULT 'INSTANT'
                    """);
            } catch (Exception e) {
                log.info("[Digest] notify_source_channel.digest_mode may already exist: {}", e.getMessage());
            }

            log.info("[Digest] 聚合通知表结构已就绪");
        } catch (Exception e) {
            log.error("[Digest] 表结构迁移失败: {}", e.getMessage());
        }
    }
}
