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
        log.info("[Push] aro_personnel 扩展列已确认");
    }

    private void addColumnIfMissing(String table, String column, String definition) {
        try {
            // MySQL: 列不存在时执行 ALTER，存在则跳过
            jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
            if (msg.contains("duplicate column") || msg.contains("already exists")) {
                return; // 幂等
            }
            log.warn("[Push] 无法确保列 {}.{}: {}", table, column, e.getMessage());
        }
    }
}
