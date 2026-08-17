package com.example.demo.modules.twin.scan.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 保证 {@code scan_occupancy_state} 表存在（扫码进出本地状态机）。
 */
@Component
@Order(115)
public class ScanOccupancyStateSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ScanOccupancyStateSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public ScanOccupancyStateSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS scan_occupancy_state (
                        user_id VARCHAR(64) NOT NULL COMMENT '主键，ARO 19 位认证 id',
                        state VARCHAR(16) NOT NULL COMMENT 'INSIDE / OUTSIDE',
                        current_room_id VARCHAR(64) NULL COMMENT '当前在馆房间 id（单房间）',
                        current_room_name VARCHAR(256) NULL COMMENT '当前房间名（冗余展示）',
                        enter_log_id VARCHAR(64) NULL COMMENT '最近一次本地 enter 流水 id',
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
                        PRIMARY KEY (user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码进出本地状态机（一人一行当前状态）'
                    """);
            log.info("[scan-occupancy-state] scan_occupancy_state 已就绪");
        } catch (Exception e) {
            log.error("[scan-occupancy-state] 表结构迁移失败: {}", e.getMessage());
        }
    }
}
