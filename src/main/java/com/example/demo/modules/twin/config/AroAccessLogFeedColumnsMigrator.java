package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 为 aro_access_log 增加瀑布流溯源展示列（可空，兼容历史数据）。
 */
@Component
@Order(114)
public class AroAccessLogFeedColumnsMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AroAccessLogFeedColumnsMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public AroAccessLogFeedColumnsMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            addColumnIfMissing("feed_source", "VARCHAR(48) NULL COMMENT '流水来源码 WEB_SCAN/ARO_OFFICIAL/…'");
            addColumnIfMissing("feed_summary_zh", "VARCHAR(255) NULL COMMENT '行尾摘要'");
            addColumnIfMissing("feed_detail_zh", "VARCHAR(2000) NULL COMMENT '详情说明'");
            addColumnIfMissing("device_display_name", "VARCHAR(255) NULL COMMENT '门禁/设备展示名'");
            log.info("[aro-access-log-feed] 溯源列检查完成");
        } catch (Exception e) {
            log.warn("[aro-access-log-feed] 迁移跳过: {}", e.getMessage());
        }
    }

    private void addColumnIfMissing(String column, String ddlSuffix) {
        Integer cnt = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(1) FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'aro_access_log'
                          AND COLUMN_NAME = ?
                        """,
                Integer.class,
                column
        );
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE aro_access_log ADD COLUMN " + column + " " + ddlSuffix);
        log.info("[aro-access-log-feed] 已添加列 {}", column);
    }
}
