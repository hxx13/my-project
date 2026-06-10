package com.example.demo.modules.material.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 确保 MATERIAL_REQUEST 的通知规则与模板在 DB 中存在。
 * 与 supplies 的通知规则模式一致——INSERT IGNORE 保证幂等。
 */
@Component
@Order(116)
public class MaterialNotifyRuleBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(MaterialNotifyRuleBootstrap.class);
    private final JdbcTemplate jdbcTemplate;

    public MaterialNotifyRuleBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            // CREATED 规则：学生提交申领后通知审核人
            jdbcTemplate.update("""
                INSERT IGNORE INTO sys_notify_rule (event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                VALUES ('CREATED', 'MATERIAL_REQUEST', 1, 'HYBRID', 1, 'work_order_created_v1', NOW())
                """);

            // COMPLETED 规则：出库完成后通知申请人
            jdbcTemplate.update("""
                INSERT IGNORE INTO sys_notify_rule (event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                VALUES ('COMPLETED', 'MATERIAL_REQUEST', 1, 'RELATED', 1, 'work_order_completed_receipt_v1', NOW())
                """);

            // APPROVED 规则：审核通过后通知申请人
            jdbcTemplate.update("""
                INSERT IGNORE INTO sys_notify_rule (event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                VALUES ('APPROVED', 'MATERIAL_REQUEST', 1, 'RELATED', 1, 'work_order_created_v1', NOW())
                """);

            log.info("[material-notify] 通知规则已就绪");
        } catch (Exception e) {
            log.error("[material-notify] 通知规则初始化失败: {}", e.getMessage());
        }
    }
}
