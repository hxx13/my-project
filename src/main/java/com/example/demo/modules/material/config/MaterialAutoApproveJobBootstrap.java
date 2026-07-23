package com.example.demo.modules.material.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 注册物资申领自动审批定时任务（默认每 15 分钟）。 */
@Component
@Order(124)
public class MaterialAutoApproveJobBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(MaterialAutoApproveJobBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public MaterialAutoApproveJobBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.update("""
                INSERT IGNORE INTO twin_job_schedule_config (job_key, enabled, cron_expression, description, update_time)
                VALUES ('MATERIAL_AUTO_APPROVE', 1, '0 * * * * *', '物资申领自动审批（按人信任+批量规则，每分钟检查触发时刻）', NOW())
                """);
        } catch (Exception e) {
            log.warn("[material-auto] job bootstrap skip: {}", e.getMessage());
        }
    }
}
