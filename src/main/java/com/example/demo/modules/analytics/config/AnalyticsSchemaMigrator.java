package com.example.demo.modules.analytics.config;



import org.slf4j.Logger;

import org.slf4j.LoggerFactory;

import org.springframework.boot.ApplicationArguments;

import org.springframework.boot.ApplicationRunner;

import org.springframework.core.annotation.Order;

import org.springframework.jdbc.core.JdbcTemplate;

import org.springframework.stereotype.Component;



@Component

@Order(102)

public class AnalyticsSchemaMigrator implements ApplicationRunner {



    private static final Logger log = LoggerFactory.getLogger(AnalyticsSchemaMigrator.class);



    private final JdbcTemplate jdbcTemplate;



    public AnalyticsSchemaMigrator(JdbcTemplate jdbcTemplate) {

        this.jdbcTemplate = jdbcTemplate;

    }



    @Override

    public void run(ApplicationArguments args) {

        try {

            jdbcTemplate.execute("""

                    CREATE TABLE IF NOT EXISTS analytics_user_view (

                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,

                        user_id VARCHAR(64) NOT NULL COMMENT '登录用户 ID',

                        report_key VARCHAR(64) NOT NULL COMMENT '报表标识，如 isolation_usage',

                        name VARCHAR(128) NOT NULL COMMENT '用户自定义视图名称',

                        filter_json JSON NOT NULL COMMENT '筛选条件 JSON',

                        is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=该报表下默认视图',

                        is_subscribed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=参与自动审计对比',

                        sort_order INT NOT NULL DEFAULT 0,

                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                        KEY idx_auv_user_report (user_id, report_key),

                        KEY idx_auv_user_default (user_id, report_key, is_default)

                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-用户筛选订阅'

                    """);

            ensureColumn("analytics_user_view", "is_subscribed",

                    "ALTER TABLE analytics_user_view ADD COLUMN is_subscribed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=参与自动审计对比' AFTER is_default");

            jdbcTemplate.execute("""

                    CREATE TABLE IF NOT EXISTS analytics_audit_log (

                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,

                        user_id VARCHAR(64) NOT NULL,

                        view_id BIGINT NOT NULL,

                        report_key VARCHAR(64) NOT NULL,

                        view_name VARCHAR(128) NOT NULL DEFAULT '',

                        period_type VARCHAR(16) NOT NULL COMMENT 'day|week|month',

                        period_label VARCHAR(32) NOT NULL,

                        current_start DATETIME NOT NULL,

                        current_end DATETIME NOT NULL,

                        previous_start DATETIME NOT NULL,

                        previous_end DATETIME NOT NULL,

                        current_rounds BIGINT NOT NULL DEFAULT 0,

                        previous_rounds BIGINT NOT NULL DEFAULT 0,

                        current_users INT NOT NULL DEFAULT 0,

                        previous_users INT NOT NULL DEFAULT 0,

                        current_groups INT NOT NULL DEFAULT 0,

                        previous_groups INT NOT NULL DEFAULT 0,

                        delta_rounds BIGINT NOT NULL DEFAULT 0,

                        delta_pct DECIMAL(10, 2) NULL,

                        top_groups_json JSON NULL,

                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        KEY idx_aal_user_report_time (user_id, report_key, created_at),

                        KEY idx_aal_view_period (view_id, period_type, created_at)

                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-订阅周期对比日志'

                    """);

            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS analytics_query_snapshot (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        user_id VARCHAR(64) NOT NULL,
                        view_id BIGINT NOT NULL,
                        report_key VARCHAR(64) NOT NULL,
                        period_key VARCHAR(64) NOT NULL,
                        query_cycle VARCHAR(16) NOT NULL,
                        filter_json JSON NOT NULL,
                        report_json JSON NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_aqs_view_period (user_id, view_id, report_key, period_key),
                        KEY idx_aqs_view (view_id, created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='隔离统计-历史周期查询快照'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS analytics_llm_insight (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        audit_log_id BIGINT NOT NULL COMMENT 'analytics_audit_log.id',
                        user_id VARCHAR(64) NOT NULL COMMENT '生成者',
                        model VARCHAR(64) NOT NULL DEFAULT '',
                        prompt_tokens INT NULL,
                        completion_tokens INT NULL,
                        insight_json JSON NOT NULL COMMENT '结构化解读',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_ali_audit (audit_log_id),
                        KEY idx_ali_user_time (user_id, created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-大模型解读缓存'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS analytics_view_share (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        share_code_hash VARCHAR(64) NOT NULL,
                        share_code_plain VARCHAR(16) NULL,
                        owner_user_id VARCHAR(64) NOT NULL,
                        source_view_id BIGINT NOT NULL,
                        report_key VARCHAR(64) NOT NULL,
                        snapshot_version INT NOT NULL DEFAULT 1,
                        payload_json MEDIUMTEXT NOT NULL,
                        audit_log_count INT NOT NULL DEFAULT 0,
                        insight_count INT NOT NULL DEFAULT 0,
                        owner_display_name VARCHAR(128) NOT NULL DEFAULT '',
                        expires_at DATETIME NOT NULL,
                        max_imports INT NOT NULL DEFAULT 10,
                        import_count INT NOT NULL DEFAULT 0,
                        revoked TINYINT(1) NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_avs_code_hash (share_code_hash),
                        KEY idx_avs_owner (owner_user_id, created_at),
                        KEY idx_avs_source_view (source_view_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-配置分享封箱'
                    """);
            ensureColumn("analytics_view_share", "share_code_plain",
                    "ALTER TABLE analytics_view_share ADD COLUMN share_code_plain VARCHAR(16) NULL COMMENT '明文分享码' AFTER share_code_hash");
            log.info("[analytics-schema] analytics 表结构已就绪");

        } catch (Exception e) {

            log.error("[analytics-schema] 表结构迁移失败: {}", e.getMessage());

        }

    }



    private void ensureColumn(String table, String column, String alterSql) {

        Integer n = jdbcTemplate.queryForObject(

                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",

                Integer.class,

                table,

                column);

        if (n == null || n == 0) {

            jdbcTemplate.execute(alterSql);

        }

    }

}


