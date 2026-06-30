package com.example.demo.modules.twin.scan.delay.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 注册延迟免冻结自动审批定时任务（默认每 15 分钟，可在定时管理调整）。
 */
@Component
@Order(123)
public class ScanDelayAutoApproveJobBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ScanDelayAutoApproveJobBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public ScanDelayAutoApproveJobBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.update("""
                INSERT IGNORE INTO twin_job_schedule_config (job_key, enabled, cron_expression, description, update_time)
                VALUES ('SCAN_DELAY_AUTO_APPROVE', 1, '0 * * * * *', '延迟免冻结自动审批（按人信任+批量规则，每分钟检查触发时刻）', NOW())
                """);
        } catch (Exception e) {
            log.warn("[scan-delay-auto] job bootstrap skip: {}", e.getMessage());
        }
    }
}
