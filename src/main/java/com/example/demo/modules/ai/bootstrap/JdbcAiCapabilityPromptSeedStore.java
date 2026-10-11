package com.example.demo.modules.ai.bootstrap;

import com.example.demo.modules.ai.tool.AiView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * {@link AiCapabilityPromptSeedStore} 的 JdbcTemplate 实现。
 *
 * <p>表由 {@code db/bootstrap-ai-capability-prompt.sql} 在本 Spring 上下文早期建好
 * （{@code EmbeddedTwinSystemCoreDdlBootstrap.afterPropertiesSet}，早于所有 ApplicationRunner），
 * 所以这里直接读写即可，不需要建表。
 */
@Component
public class JdbcAiCapabilityPromptSeedStore implements AiCapabilityPromptSeedStore {

    private final JdbcTemplate jdbc;

    public JdbcAiCapabilityPromptSeedStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int countAll() {
        Integer n = jdbc.queryForObject("SELECT COUNT(1) FROM ai_capability_prompt", Integer.class);
        return n == null ? 0 : n;
    }

    @Override
    public void insert(String groupName, String title, String promptText, String note, int sortOrder, String audience) {
        jdbc.update("""
                INSERT INTO ai_capability_prompt (group_name, title, prompt_text, note, sort_order, enabled, audience)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """, groupName, title, promptText, note == null ? "" : note, sortOrder,
                audience == null ? "" : audience);
    }
}
