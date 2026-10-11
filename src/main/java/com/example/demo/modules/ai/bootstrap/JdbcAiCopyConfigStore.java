package com.example.demo.modules.ai.bootstrap;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * {@link AiCopyConfigStore} 的 JdbcTemplate 实现：逐键「先查后写」，幂等。
 *
 * <p>两张表都没有 (module, config_key) 唯一索引，所以幂等全靠这里的 SELECT 兜底 —— 不能改成裸 INSERT。
 */
@Component
public class JdbcAiCopyConfigStore implements AiCopyConfigStore {

    private static final String DEF_TABLE = "sys_system_config_def";
    private static final String VALUE_TABLE = "sys_system_config";

    private final JdbcTemplate jdbc;

    public JdbcAiCopyConfigStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean upsertDef(String module, String configKey, String labelZh, String description, String defaultValue) {
        if (exists(DEF_TABLE, module, configKey)) {
            jdbc.update("""
                    UPDATE sys_system_config_def
                    SET label_zh = ?, description = ?, default_value = ?
                    WHERE module = ? AND config_key = ?
                    """, labelZh, description, defaultValue, module, configKey);
            return false;
        }
        jdbc.update("""
                INSERT INTO sys_system_config_def
                (module, config_key, label_zh, description, value_type, options_json, default_value,
                 is_sensitive, requires_restart, is_public, update_time)
                VALUES (?, ?, ?, ?, 'STRING', NULL, ?, 0, 0, 0, NOW())
                """, module, configKey, labelZh, description, defaultValue);
        return true;
    }

    @Override
    public boolean upsertValue(String module, String configKey, String value) {
        if (exists(VALUE_TABLE, module, configKey)) {
            jdbc.update("""
                    UPDATE sys_system_config SET config_value = ?, update_time = NOW()
                    WHERE module = ? AND config_key = ?
                    """, value, module, configKey);
            return false;
        }
        jdbc.update("""
                INSERT INTO sys_system_config (module, config_key, config_value, value_type, update_time)
                VALUES (?, ?, ?, 'STRING', NOW())
                """, module, configKey, value);
        return true;
    }

    @Override
    public Map<String, String> readValues(String module) {
        return jdbc.query(
                "SELECT config_key, config_value FROM sys_system_config WHERE module = ?",
                rs -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    while (rs.next()) {
                        m.put(rs.getString(1), rs.getString(2));
                    }
                    return m;
                }, module);
    }

    private boolean exists(String table, String module, String configKey) {
        Integer cnt = jdbc.queryForObject(
                "SELECT COUNT(1) FROM " + table + " WHERE module = ? AND config_key = ?",
                Integer.class, module, configKey);
        return cnt != null && cnt > 0;
    }
}