package com.example.demo.modules.referencedata.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 动物订购订单流转的站内通知规则种子（biz_type=REF_ORDER）。
 *
 * <p>{@code ReferenceDataService.submitOrder} 已构造 {@code PublishNotificationEvent}
 * （eventType=REF_ORDER_SUBMITTED + bizType=REF_ORDER + relatedUserIds=秘书），
 * 但 {@code NotificationService.publish} 先查 sys_notify_rule，查不到即静默丢弃。
 * 本启动器补齐规则（recipient_mode=RELATED，消费 relatedUserIds）与站内信模板。幂等：先查再插。
 */
@Component
@Order(124)
public class RefOrderNotifyRuleBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RefOrderNotifyRuleBootstrap.class);

    private static final String BIZ_TYPE = "REF_ORDER";
    private static final String TEMPLATE_KEY = "ref_order_notice_v1";
    private static final String TITLE_TPL = "动物订购订单通知 — {projectGroupName}";
    private static final String CONTENT_TPL = "课题组「{projectGroupName}」的动物订购订单（订单号 {orderId}，共 {itemCount} 项）状态有更新，请留意。";

    private static final List<String> EVENT_TYPES = List.of(
            "REF_ORDER_SUBMITTED",
            "REF_ORDER_APPROVED",
            "REF_ORDER_REJECTED",
            "REF_ORDER_COMPLETED");

    private final JdbcTemplate jdbcTemplate;

    public RefOrderNotifyRuleBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureTemplate();
            int created = 0;
            for (String eventType : EVENT_TYPES) {
                if (ensureRule(eventType)) {
                    created++;
                }
            }
            log.info("[ref-order-notify] 动物订购通知规则就绪（本次新增 {} 条）", created);
        } catch (Exception e) {
            log.warn("[ref-order-notify] 动物订购通知规则初始化失败: {}", e.getMessage());
        }
    }

    private void ensureTemplate() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_notify_template WHERE template_key = ?",
                Integer.class, TEMPLATE_KEY);
        if (n != null && n > 0) {
            jdbcTemplate.update(
                    "UPDATE sys_notify_template SET title_tpl=?, content_tpl=?, enabled=1, update_time=NOW() WHERE template_key=?",
                    TITLE_TPL, CONTENT_TPL, TEMPLATE_KEY);
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_notify_template(template_key, title_tpl, content_tpl, enabled, update_time)
                        VALUES (?, ?, ?, 1, NOW())
                        """,
                TEMPLATE_KEY, TITLE_TPL, CONTENT_TPL);
    }

    private boolean ensureRule(String eventType) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_notify_rule WHERE UPPER(TRIM(event_type)) = ? AND UPPER(TRIM(biz_type)) = ?",
                Integer.class, eventType, BIZ_TYPE);
        if (n != null && n > 0) {
            return false;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_notify_rule(event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                        VALUES (?, ?, 1, 'RELATED', 1, ?, NOW())
                        """,
                eventType, BIZ_TYPE, TEMPLATE_KEY);
        return true;
    }
}
