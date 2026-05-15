package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 官方流水与孪生操作（扫码/自动签退等）批量溯源匹配：待匹配队列表。
 */
@Component
@Order(115)
public class TwinAccessCorrelationTableMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(TwinAccessCorrelationTableMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public TwinAccessCorrelationTableMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS twin_access_correlation_pending (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        access_type INT NOT NULL COMMENT '1进入 2离开 与ARO save接口一致',
                        user_id VARCHAR(64) NOT NULL,
                        room_id VARCHAR(64) NOT NULL,
                        source_tag VARCHAR(32) NOT NULL COMMENT 'AUTO_SIGNOUT/WEB_SCAN等',
                        automation_log_id BIGINT NULL,
                        summary_zh VARCHAR(512) NULL,
                        detail_zh VARCHAR(2000) NULL,
                        op_time DATETIME NOT NULL COMMENT '孪生侧发起登记的时刻',
                        consumed TINYINT NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        KEY idx_pending_match (user_id, room_id, access_type, consumed, op_time)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ARO流水落库前孪生登记，用于feed溯源批量匹配'
                    """);
            log.info("[twin-access-correlation] 表 twin_access_correlation_pending 就绪");
        } catch (Exception e) {
            log.warn("[twin-access-correlation] 建表跳过: {}", e.getMessage());
        }
    }
}
