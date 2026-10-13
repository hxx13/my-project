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

    /**
     * 每个流转点一条专属模板。
     *
     * <p>原先把 9 个 eventType 全指向同一条 {@code aup_review_notice_v1}，结果是「审核通过」和「被退回修改」
     * 收到的标题正文一模一样，收件人光看通知判断不出结果。此处按场景拆开：
     * 一条事件类型 = 一条模板（template_key = eventType 小写）。
     */
    private record Notice(String eventType, String title, String content) {
    }

    private static final List<Notice> NOTICES = List.of(
            new Notice("AUP_SUBMITTED", "AUP 已提交 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）已提交，进入审核流程。{comment}"),
            new Notice("AUP_PI_RETURNED", "AUP 被组长退回 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）被组长退回，请修改后重新提交。{comment}"),
            new Notice("AUP_TO_FORMAT", "AUP 已转格式审查 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）已通过组长审核，转入格式审查。{comment}"),
            new Notice("AUP_FORMAT_RETURNED", "AUP 被格式审查退回 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）在格式审查环节被退回，请修改后重新提交。{comment}"),
            new Notice("AUP_ASSIGNED", "AUP 已分配专家审查 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）格式审查通过，已分配专家开展审查。{comment}"),
            new Notice("AUP_EXPERT_RETURNED", "AUP 被专家退回 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）经专家审查提出修改要求，请修改后重新提交。{comment}"),
            new Notice("AUP_TERMINATED", "AUP 审核未通过 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）审核未通过，流程已终止。{comment}"),
            new Notice("AUP_APPROVED", "AUP 审核通过 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）已审核通过。{comment}"),
            new Notice("AUP_EXPIRED", "AUP 已到有效期 — {projectName}",
                    "计划书「{projectName}」（{registerNo}）已超过有效期，如需继续使用请办理续期。{comment}"));

    private final JdbcTemplate jdbcTemplate;

    public AupNotifyRuleBootstrap(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int created = 0;
            for (Notice n : NOTICES) {
                ensureTemplate(n);
                if (ensureRule(n.eventType())) {
                    created++;
                }
            }
            log.info("[aup-notify] AUP 通知规则就绪（本次新增 {} 条）", created);
        } catch (Exception e) {
            log.warn("[aup-notify] AUP 通知规则初始化失败: {}", e.getMessage());
        }
    }

    /** 站内信模板：不存在则插入，已存在则刷新文案（保持与最新种子一致）。 */
    private void ensureTemplate(Notice n) {
        String key = templateKeyOf(n.eventType());
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_notify_template WHERE template_key = ?",
                Integer.class, key);
        if (cnt != null && cnt > 0) {
            jdbcTemplate.update(
                    "UPDATE sys_notify_template SET title_tpl=?, content_tpl=?, enabled=1, update_time=NOW() WHERE template_key=?",
                    n.title(), n.content(), key);
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_notify_template(template_key, title_tpl, content_tpl, enabled, update_time)
                        VALUES (?, ?, ?, 1, NOW())
                        """,
                key, n.title(), n.content());
    }

    /** 单条规则：先查再插，保证幂等（不依赖 event_type+biz_type 唯一键）。 */
    private boolean ensureRule(String eventType) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_notify_rule WHERE UPPER(TRIM(event_type)) = ? AND UPPER(TRIM(biz_type)) = ?",
                Integer.class, eventType, BIZ_TYPE);
        if (n != null && n > 0) {
            // 存量库上把旧规则指向的公共模板刷成各自的专属模板
            jdbcTemplate.update(
                    "UPDATE sys_notify_rule SET template_key=? WHERE UPPER(TRIM(event_type))=? AND UPPER(TRIM(biz_type))=?",
                    templateKeyOf(eventType), eventType, BIZ_TYPE);
            return false;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_notify_rule(event_type, biz_type, enabled, recipient_mode, min_role_level, template_key, update_time)
                        VALUES (?, ?, 1, 'RELATED', 1, ?, NOW())
                        """,
                eventType, BIZ_TYPE, templateKeyOf(eventType));
        return true;
    }

    private static String templateKeyOf(String eventType) {
        return "aup_" + eventType.toLowerCase();
    }
}
