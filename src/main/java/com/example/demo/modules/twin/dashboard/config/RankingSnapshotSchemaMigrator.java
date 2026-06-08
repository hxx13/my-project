package com.example.demo.modules.twin.dashboard.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class RankingSnapshotSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(RankingSnapshotSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public RankingSnapshotSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS dashboard_ranking_snapshot (
                        snapshot_key  VARCHAR(64) PRIMARY KEY COMMENT '如 activity:TOTAL, animal:PUDONG',
                        snapshot_json JSON NOT NULL COMMENT '[{"name":"课题组A","value":123,"rank":1},...]',
                        updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='大屏排行榜趋势快照'
                    """);
            log.info("[ranking-snapshot] dashboard_ranking_snapshot 表已就绪");
        } catch (Exception e) {
            log.error("[ranking-snapshot] 建表失败: {}", e.getMessage());
        }
    }
}
