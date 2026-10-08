package com.example.demo.modules.ai.bootstrap;

import com.example.demo.modules.ai.service.AiPromptService;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.ToolRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 注册约束（提示词）的配置**定义**到系统设置，供后台查看与覆盖。
 *
 * 只登记定义，**不写默认值正文** —— 默认值留在代码里（{@link AiPromptService} 与各包的
 * {@code defaultPrompt()}），库里的值只是管理员覆盖。理由见 AiPromptService 类注释。
 *
 * 定义内容由 {@link ToolRegistry} 驱动：**新增工具包会自动多出一条设置项，本类不用改**（E1）。
 */
@Component
@Order(126)
public class AiPromptSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AiPromptSeed.class);

    private final JdbcTemplate jdbcTemplate;
    private final ToolRegistry toolRegistry;

    public AiPromptSeed(JdbcTemplate jdbcTemplate, ToolRegistry toolRegistry) {
        this.jdbcTemplate = jdbcTemplate;
        this.toolRegistry = toolRegistry;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureDef(
                    AiPromptService.MODULE,
                    AiPromptService.GLOBAL_PROMPT_KEY,
                    "全局约束",
                    "发给模型的前提约束（平台级）：身份、三态判断、该不该问。留空使用代码内置默认",
                    "STRING",
                    "",
                    0,
                    0,
                    0);

            for (AiToolPack pack : toolRegistry.packs()) {
                ensureDef(
                        AiPromptService.MODULE,
                        AiPromptService.packPromptKey(pack.packKey()),
                        pack.displayName() + " · 专属口径",
                        "「" + pack.displayName() + "」域特有的口径，追加在全局约束之后。留空使用该工具包内置默认",
                        "STRING",
                        "",
                        0,
                        0,
                        0);
            }
            log.info("[ai-prompt] 已登记 {} 个约束配置项", 1 + toolRegistry.packs().size());
        } catch (Exception e) {
            log.error("[ai-prompt] 约束配置定义登记失败: {}", e.getMessage(), e);
        }
    }

    private void ensureDef(String module, String configKey, String labelZh, String description,
                           String valueType, String defaultValue,
                           int isSensitive, int requiresRestart, int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class, module, configKey);
        if (cnt != null && cnt > 0) {
            jdbcTemplate.update(
                    """
                            UPDATE sys_system_config_def
                            SET label_zh = ?, description = ?, value_type = ?, default_value = ?
                            WHERE module = ? AND config_key = ?
                            """,
                    labelZh, description, valueType, defaultValue, module, configKey);
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value,
                         is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NOW())
                        """,
                module, configKey, labelZh, description, valueType, defaultValue,
                isSensitive, requiresRestart, isPublic);
        log.info("[ai-prompt] 已插入配置定义: {}.{}", module, configKey);
    }
}
