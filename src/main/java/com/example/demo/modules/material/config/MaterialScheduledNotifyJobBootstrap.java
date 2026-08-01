package com.example.demo.modules.material.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 注册物资申领预约通知定时任务（默认每分钟检查一次）。 */
@Component
@Order(125)
public class MaterialScheduledNotifyJobBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(MaterialScheduledNotifyJobBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public MaterialScheduledNotifyJobBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.update("""
                INSERT IGNORE INTO twin_job_schedule_config (job_key, enabled, cron_expression, description, update_time)
                VALUES ('MATERIAL_SCHEDULED_NOTIFY', 1, '0 * * * * *', '物资申领预约通知（每分钟扫描到窗口的预约单）', NOW())
                """);
        } catch (Exception e) {
            log.warn("[material-scheduled-notify] job bootstrap skip: {}", e.getMessage());
        }
    }
}
