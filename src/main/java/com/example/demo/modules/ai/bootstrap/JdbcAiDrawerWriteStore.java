package com.example.demo.modules.ai.bootstrap;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.Collection;
import java.util.List;

/**
 * {@link AiDrawerWriteStore} 的 JdbcTemplate 实现。
 *
 * <p>能力表由 {@code db/bootstrap-ai-capability-prompt.sql} 在 Spring 上下文早期建好。
 * 审计表 {@code sys_system_config_audit} 的**真实形状以库为准**（{@code db/schema.sql} 只是归档）：
 * {@code config_id} 是 {@code NOT NULL} 且无默认值，{@code old_value/new_value} 为 {@code varchar(2000)}，
 * 时间列是 {@code create_time}（默认 {@code CURRENT_TIMESTAMP}）。
 */
@Component
public class JdbcAiDrawerWriteStore implements AiDrawerWriteStore {

    private final JdbcTemplate jdbc;

    public JdbcAiDrawerWriteStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<CapabilityItem> selectAllOrdered() {
        return jdbc.query("""
                SELECT id, group_name, title, prompt_text, note, sort_order, enabled, audience
                FROM ai_capability_prompt
                ORDER BY sort_order ASC, id ASC
                """, (rs, rowNum) -> new CapabilityItem(
                rs.getLong("id"),
                rs.getString("group_name"),
                rs.getString("title"),
                rs.getString("prompt_text"),
                rs.getString("note"),
                rs.getInt("sort_order"),
                rs.getBoolean("enabled"),
                rs.getString("audience")));
    }

    @Override
    public long insert(CapabilityItem item) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO ai_capability_prompt (group_name, title, prompt_text, note, sort_order, enabled, audience)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, item.groupName());
            ps.setString(2, item.title());
            ps.setString(3, item.promptText());
            ps.setString(4, item.note() == null ? "" : item.note());
            ps.setInt(5, item.sortOrder() == null ? 0 : item.sortOrder());
            ps.setInt(6, Boolean.FALSE.equals(item.enabled()) ? 0 : 1);
            ps.setString(7, item.audience() == null ? "" : item.audience());
            return ps;
        }, keys);
        Number id = keys.getKey();
        return id == null ? 0L : id.longValue();
    }

    @Override
    public int update(CapabilityItem item) {
        return jdbc.update("""
                UPDATE ai_capability_prompt
                SET group_name = ?, title = ?, prompt_text = ?, note = ?, sort_order = ?, enabled = ?, audience = ?
                WHERE id = ?
                """, item.groupName(), item.title(), item.promptText(),
                item.note() == null ? "" : item.note(),
                item.sortOrder() == null ? 0 : item.sortOrder(),
                Boolean.FALSE.equals(item.enabled()) ? 0 : 1,
                item.audience() == null ? "" : item.audience(),
                item.id());
    }

    @Override
    public int deleteByIds(Collection<Long> ids) {
        int n = 0;
        for (Long id : ids) {
            if (id != null) {
                n += jdbc.update("DELETE FROM ai_capability_prompt WHERE id = ?", id);
            }
        }
        return n;
    }

    @Override
    public void insertAudit(String module, String configKey, String oldValue, String newValue, String operatorId) {
        // 真实表（非 db/schema 归档）里 config_id 是 NOT NULL 且无默认值，必须带上 ——
        // 取该配置键在 sys_system_config 里的行 id（调用前 upsertValue 已保证该行存在）。
        jdbc.update("""
                INSERT INTO sys_system_config_audit (config_id, module, config_key, old_value, new_value, operator_id)
                VALUES (COALESCE((SELECT id FROM sys_system_config WHERE module = ? AND config_key = ? LIMIT 1), 0),
                        ?, ?, ?, ?, ?)
                """, module, configKey, module, configKey, oldValue, newValue, operatorId);
    }
}
