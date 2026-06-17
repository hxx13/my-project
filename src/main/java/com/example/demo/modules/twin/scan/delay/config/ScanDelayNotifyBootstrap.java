package com.example.demo.modules.twin.scan.delay.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 扫码延迟审核通知规则（biz_type=SCAN_DELAY）。
 */
@Component
@Order(122)
public class ScanDelayNotifyBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ScanDelayNotifyBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public ScanDelayNotifyBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.update("""
                INSERT IGNORE INTO sys_notify_rule (event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                VALUES ('CREATED', 'SCAN_DELAY', 1, 'RELATED', 1, 'work_order_created_v1', NOW())
                """);
            jdbcTemplate.update("""
                INSERT IGNORE INTO sys_notify_rule (event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                VALUES ('COMPLETED', 'SCAN_DELAY', 1, 'RELATED', 1, 'work_order_completed_receipt_v1', NOW())
                """);
        } catch (Exception e) {
            log.warn("[scan-delay] notify bootstrap skip: {}", e.getMessage());
        }
    }
}
