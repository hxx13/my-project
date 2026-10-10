package com.example.demo.modules.ai.timer.bootstrap;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Locale;

/**
 * 给 {@code ai_timer} 补齐后加的两列。
 *
 * <p>为什么用 ColumnEnsurer 而不是 bootstrap SQL：那个文件里已经有一条 CREATE TABLE，
 * 再追加 ALTER 会被前一条的 benign 失败整段跳过（同一个文件多语句踩过 Unknown column）。
 * 这里按仓库既有的 {@code SysUserMiniPreferencesColumnEnsurer} 那套：启动时查一次列，缺了就补，幂等。
 *
 * <p>两列各自的用途：
 * <ul>
 *   <li>{@code need_confirm} —— 建单时选的「到点先问我要不要执行」。默认 0 = 到点直接跑
 *       （建单那一刻的确认就是同意书，到点再问一次等于把定时打回手动）。</li>
 *   <li>{@code notify_user_ids} —— 执行成功后推送给谁（逗号分隔的账号 id）。
 *       空 = 推给建单人，也就是「当前对话的人」。</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(name = "app.schema.auto-ensure-ai-timer", havingValue = "true", matchIfMissing = true)
public class AiTimerColumnEnsurer {

    private static final Logger log = LoggerFactory.getLogger(AiTimerColumnEnsurer.class);

    private final DataSource dataSource;

    public AiTimerColumnEnsurer(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @PostConstruct
    public void ensureColumns() {
        try (Connection c = dataSource.getConnection()) {
            if (!isMysqlFamily(c)) {
                return;
            }
            addIfMissing(c, "need_confirm",
                    "ALTER TABLE ai_timer ADD COLUMN need_confirm TINYINT NOT NULL DEFAULT 0 "
                            + "COMMENT '到点是否先等用户确认（1=等）'");
            addIfMissing(c, "notify_user_ids",
                    "ALTER TABLE ai_timer ADD COLUMN notify_user_ids VARCHAR(512) NULL "
                            + "COMMENT '执行成功后推送给谁（逗号分隔账号id；空=建单人）'");
        } catch (Exception e) {
            log.warn("[schema] ai_timer 列补齐失败，可手动执行等价 ALTER：{}", e.getMessage());
        }
    }

    private void addIfMissing(Connection c, String column, String ddl) throws Exception {
        if (columnExists(c, column)) {
            return;
        }
        try (Statement st = c.createStatement()) {
            st.executeUpdate(ddl);
            log.info("[schema] 已为 ai_timer 增加列 {}", column);
        }
    }

    private boolean columnExists(Connection c, String column) throws Exception {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SHOW COLUMNS FROM ai_timer LIKE '" + column + "'")) {
            return rs.next();
        }
    }

    /** 只在 MySQL/MariaDB 上动手；别的库（单测用的内存库）跳过。 */
    private boolean isMysqlFamily(Connection c) {
        try {
            String p = c.getMetaData().getDatabaseProductName();
            if (p == null) {
                return false;
            }
            String lower = p.toLowerCase(Locale.ROOT);
            return List.of("mysql", "mariadb").stream().anyMatch(lower::contains);
        } catch (Exception e) {
            return false;
        }
    }
}
