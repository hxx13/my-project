package com.example.demo.modules.twin.common.config;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@StartupPhase(name = "定时任务表", order = 111, description = "twin_job_schedule_config + 列补齐")
@Component
@Order(111)
public class TwinJobScheduleSchemaMigrator implements StartupRunner {
    private final JdbcTemplate jdbcTemplate;

    public TwinJobScheduleSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public StartupResult run(StartupContext ctx) {
        ctx.subtask("create-table", () -> {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS twin_job_schedule_config (
                    job_key VARCHAR(64) PRIMARY KEY COMMENT '任务唯一键',
                    job_name VARCHAR(128) NOT NULL COMMENT '任务名称',
                    enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用',
                    cron_expression VARCHAR(64) NULL COMMENT 'cron 表达式',
                    description VARCHAR(256) NULL COMMENT '任务描述',
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
        });
        ctx.subtask("ensure-cols", () -> {
            ensureCol("twin_job_schedule_config", "schedule_start_time", "VARCHAR(8) NOT NULL DEFAULT '07:00'");
            ensureCol("twin_job_schedule_config", "schedule_end_time", "VARCHAR(8) NOT NULL DEFAULT '22:00'");
            ensureCol("twin_job_schedule_config", "cron_expression", "VARCHAR(64) NULL");
            ensureCol("twin_job_schedule_config", "description", "VARCHAR(256) NULL");
        });
        return StartupResult.success("就绪");
    }

    private void ensureCol(String table, String col, String def) {
        try {
            Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?",
                Integer.class, table, col);
            if (cnt == null || cnt == 0) {
                jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + col + " " + def);
            }
        } catch (Exception ignored) {}
    }
}
