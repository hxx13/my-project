package com.example.demo.common.schema;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Locale;

/**
 * 历史库可能未执行 manual_migrate_sys_user_mysql.sql，导致查询 sys_user 时报 Unknown column。
 * 在 MySQL/MariaDB 上启动时检测一次，缺列则自动 ALTER（可与 DBA 手工迁移二选一）。
 */
@Component
@ConditionalOnProperty(name = "app.schema.auto-ensure-sys-user-mini-preferences", havingValue = "true", matchIfMissing = true)
public class SysUserMiniPreferencesColumnEnsurer {

    private static final Logger log = LoggerFactory.getLogger(SysUserMiniPreferencesColumnEnsurer.class);

    private final DataSource dataSource;

    public SysUserMiniPreferencesColumnEnsurer(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @PostConstruct
    public void ensureColumn() {
        try (Connection c = dataSource.getConnection()) {
            if (!isMysqlFamily(c)) {
                return;
            }
            if (columnExists(c)) {
                return;
            }
            try (Statement st = c.createStatement()) {
                st.executeUpdate(
                    "ALTER TABLE sys_user ADD COLUMN mini_preferences_json LONGTEXT NULL "
                        + "COMMENT '小程序个人配置JSON（房间关注区域等）'");
                log.info("[schema] 已为 sys_user 增加列 mini_preferences_json");
            }
        } catch (Exception e) {
            log.warn("[schema] 无法自动补齐 sys_user.mini_preferences_json，请手动执行 manual_migrate_sys_user_mysql.sql：{}", e.getMessage());
        }
    }

    private static boolean isMysqlFamily(Connection c) throws Exception {
        String p = c.getMetaData().getDatabaseProductName();
        if (p == null) {
            return false;
        }
        String lower = p.toLowerCase(Locale.ROOT);
        return lower.contains("mysql") || lower.contains("mariadb");
    }

    private static boolean columnExists(Connection c) throws Exception {
        String sql =
            "SELECT COUNT(1) AS cnt FROM information_schema.COLUMNS "
                + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'mini_preferences_json'";
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            if (!rs.next()) {
                return false;
            }
            return rs.getInt("cnt") > 0;
        }
    }
}
