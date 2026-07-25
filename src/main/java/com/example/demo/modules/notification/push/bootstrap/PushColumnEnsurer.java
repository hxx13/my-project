package com.example.demo.modules.notification.push.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * 确保 aro_personnel 的 contact_email / send_key 列存在。
 * 必须晚于 EmbeddedTwinSystemCoreDdlBootstrap（@StartupPhase order=2）执行，
 * 因为 aro_personnel 表由其他 bootstrap 脚本创建。
 */
@Component
public class PushColumnEnsurer implements InitializingBean {

    private static final Logger log = LoggerFactory.getLogger(PushColumnEnsurer.class);

    private final JdbcTemplate jdbc;

    public PushColumnEnsurer(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void afterPropertiesSet() {
        addColumnIfMissing("aro_personnel", "contact_email",
                "VARCHAR(256) DEFAULT NULL COMMENT '联系邮箱（本地管理，不被ARO同步覆盖）'");
        addColumnIfMissing("aro_personnel", "send_key",
                "VARCHAR(512) DEFAULT NULL COMMENT 'Server酱SendKey（本地管理）'");
        addColumnIfMissing("sys_user", "contact_email",
                "VARCHAR(256) DEFAULT NULL COMMENT '联系邮箱（本地管理，用于推送通知）'");
        addColumnIfMissing("sys_user", "send_key",
                "VARCHAR(256) DEFAULT NULL COMMENT 'Server酱SendKey（用于微信推送通知）'");
        ensureRecipientScopeValueWidth();
        log.info("[Push] aro_personnel + sys_user 扩展列已确认");
    }

    private void addColumnIfMissing(String table, String column, String definition) {
        try {
            jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("[Push] 新增列 {}.{}", table, column);
        } catch (Exception e) {
            // 列已存在 → 幂等跳过（覆盖各种 MySQL 版本的报错措辞）
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            Throwable cause = e.getCause();
            String causeMsg = cause != null && cause.getMessage() != null
                    ? cause.getMessage().toLowerCase() : "";
            if (msg.contains("duplicate") || msg.contains("already exists")
                    || causeMsg.contains("duplicate") || causeMsg.contains("already exists")
                    || (msg.contains("bad sql") && causeMsg.contains("duplicate"))) {
                log.debug("[Push] 列已存在，跳过: {}.{}", table, column);
                return;
            }
            log.warn("[Push] 无法确保列 {}.{}: {}", table, column, msg);
        }
    }

    /** 扩宽 notify_source_recipient.scope_value 以容纳逗号分隔的多用户ID */
    private void ensureRecipientScopeValueWidth() {
        // 1. 尝试删除含 scope_value 的唯一键（VARCHAR(2000) 超索引长度）
        try {
            jdbc.execute("ALTER TABLE notify_source_recipient DROP INDEX uk_src_psp_scope");
            log.info("[Push] 已移除 notify_source_recipient 唯一键 uk_src_psp_scope");
        } catch (Exception e) {
            log.debug("[Push] 唯一键 uk_src_psp_scope 不存在或已移除: {}", e.getMessage());
        }
        // 2. 扩宽列
        try {
            jdbc.execute("ALTER TABLE notify_source_recipient MODIFY COLUMN scope_value VARCHAR(128) COMMENT '单用户ID（每人一行）'");
            log.info("[Push] notify_source_recipient.scope_value 已更新为 VARCHAR(128)");
        } catch (Exception e) {
            log.debug("[Push] scope_value 列修改跳过: {}", e.getMessage());
        }
    }
}
