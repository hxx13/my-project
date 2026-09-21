package com.example.demo.modules.personnel.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 课题组归属通知的站内信规则种子（biz_type=PROJECT_GROUP）。
 *
 * <p>{@code ProjectGroupMembershipService} 用 {@code NotificationService.publish}
 * 发申请/审批/移出通知（relatedUserIds = 申请人/被踢人的账号 id），但 publish 先查
 * sys_notify_rule，查不到即静默丢弃 —— 与 AUP 的 {@code AupNotifyRuleBootstrap} 同因。
 * 本启动器补齐 sys_notify_rule（recipient_mode=RELATED，消费 relatedUserIds）与站内信模板。
 * 幂等：先查再插。文案统一走 {summary}（service 侧按事件拼好完整句子）。
 */
@Component
@Order(124)
public class ProjectGroupNotifyRuleBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ProjectGroupNotifyRuleBootstrap.class);

    private static final String BIZ_TYPE = "PROJECT_GROUP";
    private static final String TEMPLATE_KEY = "project_group_membership_v1";
    private static final String TITLE_TPL = "课题组通知 — {groupName}";
    private static final String CONTENT_TPL = "{summary}";

    private static final List<String> EVENT_TYPES = List.of(
            "PG_APPLIED", "PG_APPROVED", "PG_REJECTED", "PG_REMOVED");

    private final JdbcTemplate jdbcTemplate;

    public ProjectGroupNotifyRuleBootstrap(JdbcTemplate jdbcTemplate) {
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
            log.info("[project-group] 通知规则就绪（本次新增 {} 条）", created);
        } catch (Exception e) {
            log.warn("[project-group] 通知规则初始化失败: {}", e.getMessage());
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
                "INSERT INTO sys_notify_template(template_key, title_tpl, content_tpl, enabled, update_time) "
                        + "VALUES (?, ?, ?, 1, NOW())",
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
                "INSERT INTO sys_notify_rule(event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time) "
                        + "VALUES (?, ?, 1, 'RELATED', 1, ?, NOW())",
                eventType, BIZ_TYPE, TEMPLATE_KEY);
        return true;
    }
}
