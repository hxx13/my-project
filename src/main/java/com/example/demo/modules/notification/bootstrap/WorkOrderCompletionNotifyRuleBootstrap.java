package com.example.demo.modules.notification.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 确保「申请办结 → 申请人站内通知」规则存在。
 * 若库中已手动配置同 event+biz 规则则跳过；模板内容会在每次启动时更新到最新文案。
 */
@Component
@Order(115)
public class WorkOrderCompletionNotifyRuleBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(WorkOrderCompletionNotifyRuleBootstrap.class);

    private static final String TEMPLATE_KEY = "work_order_completed_receipt_v1";
    private static final String TITLE_TPL = "{bizTypeZh}申请已处理";
    private static final String CONTENT_TPL = "你的{bizTypeZh}申请已处理完成。{summary}";

    private final JdbcTemplate jdbcTemplate;

    public WorkOrderCompletionNotifyRuleBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureTemplate();
            ensureRule("REPAIR");
            ensureRule("PURCHASE");
            ensureRule("SUPPLIES_CLAIM");
            log.info("[notify] ensured work-order COMPLETED receipt rules (RELATED)");
        } catch (Exception ex) {
            log.debug("[notify] completion receipt seed skipped: {}", ex.getMessage());
        }
    }

    private void ensureTemplate() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_notify_template WHERE template_key = ?",
                Integer.class,
                TEMPLATE_KEY);
        if (n != null && n > 0) {
            jdbcTemplate.update(
                    "UPDATE sys_notify_template SET title_tpl=?, content_tpl=?, update_time=NOW() WHERE template_key=?",
                    TITLE_TPL, CONTENT_TPL, TEMPLATE_KEY);
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_notify_template(template_key, title_tpl, content_tpl, enabled, update_time)
                        VALUES (?, ?, ?, 1, NOW())
                        """,
                TEMPLATE_KEY,
                TITLE_TPL,
                CONTENT_TPL);
    }

    private void ensureRule(String bizType) {
        Integer n = jdbcTemplate.queryForObject(
                """
                        SELECT COUNT(1) FROM sys_notify_rule
                        WHERE UPPER(TRIM(event_type)) = 'COMPLETED' AND UPPER(TRIM(biz_type)) = ?
                        """,
                Integer.class,
                bizType);
        if (n != null && n > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_notify_rule(event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                        VALUES ('COMPLETED', ?, 1, 'RELATED', 1, ?, NOW())
                        """,
                bizType,
                TEMPLATE_KEY);
    }
}
