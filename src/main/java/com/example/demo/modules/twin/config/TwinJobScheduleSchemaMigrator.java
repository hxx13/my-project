package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(111)
public class TwinJobScheduleSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(TwinJobScheduleSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public TwinJobScheduleSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS twin_job_schedule_config (
                        job_key VARCHAR(64) PRIMARY KEY COMMENT '任务唯一键',
                        job_name VARCHAR(128) NOT NULL COMMENT '任务名称',
                        enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用',
                        schedule_type VARCHAR(16) NOT NULL DEFAULT 'DAILY' COMMENT 'DAILY/WEEKLY',
                        schedule_time VARCHAR(8) NOT NULL DEFAULT '02:00' COMMENT 'HH:mm',
                        schedule_start_time VARCHAR(8) NOT NULL DEFAULT '07:00' COMMENT '执行窗口开始 HH:mm',
                        schedule_end_time VARCHAR(8) NOT NULL DEFAULT '22:00' COMMENT '执行窗口结束 HH:mm',
                        week_days VARCHAR(32) NULL COMMENT '周计划:1,2,3..7',
                        last_run_at DATETIME NULL COMMENT '最近执行时间',
                        last_success_at DATETIME NULL COMMENT '最近成功时间',
                        last_status VARCHAR(16) NULL COMMENT 'SUCCESS/FAILED/RUNNING',
                        last_error VARCHAR(500) NULL COMMENT '最近错误摘要',
                        updated_by VARCHAR(64) NULL COMMENT '更新人',
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一定时任务配置与最近执行状态'
                    """);
            ensureColumnExists("twin_job_schedule_config", "schedule_start_time",
                    "ALTER TABLE twin_job_schedule_config ADD COLUMN schedule_start_time VARCHAR(8) NOT NULL DEFAULT '07:00'");
            ensureColumnExists("twin_job_schedule_config", "schedule_end_time",
                    "ALTER TABLE twin_job_schedule_config ADD COLUMN schedule_end_time VARCHAR(8) NOT NULL DEFAULT '22:00'");
            log.info("[twin-schedule-schema] twin_job_schedule_config 表已就绪");
        } catch (Exception e) {
            log.error("[twin-schedule-schema] 迁移失败: {}", e.getMessage());
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        try {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                    Integer.class,
                    tableName,
                    columnName
            );
            if (count != null && count > 0) return;
            jdbcTemplate.execute(alterSql);
        } catch (Exception e) {
            log.warn("[twin-schedule-schema] 列检查/补齐失败 {}.{}: {}", tableName, columnName, e.getMessage());
        }
    }
}
