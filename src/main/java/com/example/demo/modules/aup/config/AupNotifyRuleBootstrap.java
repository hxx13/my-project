package com.example.demo.modules.aup.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * AUP 审核 9 个流转点的站内通知规则种子（biz_type=AUP）。
 *
 * <p>背景：{@code AupService.notifyForTransition} / {@code AupReviewService.notifyAssignedExperts}
 * 已正确构造 {@code PublishNotificationEvent}（eventType + bizType="AUP" + relatedUserIds），
 * 但 {@code NotificationService.publish} 先查 sys_notify_rule，查不到即静默丢弃 —— AUP 此前只注册了
 * notify_source（推送配置页用），没有任何 sys_notify_rule 种子，导致 9 个流转点通知全部失效。
 *
 * <p>本启动器补齐 sys_notify_rule（recipient_mode=RELATED，消费 relatedUserIds）与站内信模板。
 * 幂等：先查再插，重复启动不重复插入。eventType 以 {@code NotifySourceRegistry} 注册的 AUP_* 源为准，
 * 与 {@code AupService} / {@code AupReviewService} 发布事件一一对应。
 */
@Component
@Order(123)
public class AupNotifyRuleBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AupNotifyRuleBootstrap.class);

    private static final String BIZ_TYPE = "AUP";
    private static final String TEMPLATE_KEY = "aup_review_notice_v1";
    private static final String TITLE_TPL = "AUP 计划书通知 — {projectName}";
    private static final String CONTENT_TPL = "计划书「{projectName}」（{registerNo}）审核状态有更新，请留意。{comment}";

    /** 与 NotifySourceRegistry 注册的 AUP_* 源、AupService / AupReviewService 发布事件一一对应 */
    private static final List<String> AUP_EVENT_TYPES = List.of(
            "AUP_SUBMITTED",
            "AUP_PI_RETURNED",
            "AUP_TO_FORMAT",
            "AUP_FORMAT_RETURNED",
            "AUP_ASSIGNED",
            "AUP_EXPERT_RETURNED",
            "AUP_TERMINATED",
            "AUP_APPROVED",
            "AUP_EXPIRED");

    private final JdbcTemplate jdbcTemplate;

    public AupNotifyRuleBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureTemplate();
            int created = 0;
            for (String eventType : AUP_EVENT_TYPES) {
                if (ensureRule(eventType)) {
                    created++;
                }
            }
            log.info("[aup-notify] AUP 通知规则就绪（本次新增 {} 条）", created);
        } catch (Exception e) {
            log.warn("[aup-notify] AUP 通知规则初始化失败: {}", e.getMessage());
        }
    }

    /** 站内信模板：不存在则插入，已存在则刷新文案（保持与最新种子一致）。 */
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

    /** 单条规则：先查再插，保证幂等（不依赖 event_type+biz_type 唯一键）。 */
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
