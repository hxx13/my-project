package com.example.demo.modules.llm.bootstrap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import com.example.demo.modules.llm.LlmInsightModules;
import org.springframework.stereotype.Component;

/**
 * 大模型（通义/DashScope 兼容）连接参数：超级管理员在「系统设置 → 大模型」维护。
 */
@Component
@Order(125)
public class LlmConfigSeed implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LlmConfigSeed.class);

    private final JdbcTemplate jdbcTemplate;

    public LlmConfigSeed(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            String modelOptions = "[\"qwen-plus\",\"qwen-max\",\"qwen-turbo\",\"qwen-long\"]";
            ensureDef("llm", "llm.enabled", "启用大模型", "关闭后统计页无法生成 AI 解读", "BOOLEAN", null, "false", 0, 0, 0);
            ensureDef(
                    "llm",
                    "llm.api_key",
                    "API Key",
                    "阿里云百炼 API Key（sk- 开头）；仅后端调用，勿公开",
                    "STRING",
                    null,
                    "",
                    1,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.base_url",
                    "API Base URL",
                    "OpenAI 兼容地址，如 https://dashscope.aliyuncs.com/compatible-mode/v1 或业务空间导出地址",
                    "STRING",
                    null,
                    "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    0,
                    0,
                    0);
            ensureDef("llm", "llm.model", "主模型", "优先使用；失败时按备用列表自动切换", "STRING", modelOptions, "qwen-plus", 0, 0, 0);
            ensureDef(
                    "llm",
                    "llm.model_fallback",
                    "备用模型列表",
                    "逗号分隔，主模型失败或限流时依次尝试。无需填写全部 124 个模型，2～5 个即可，如 qwen-turbo,qwen-plus,qwen-max",
                    "STRING",
                    null,
                    "qwen-turbo,qwen-plus,qwen-max",
                    0,
                    0,
                    0);
            ensureDef("llm", "llm.max_tokens", "最大输出 Token", "单次解读上限，建议 1024–4096", "NUMBER", null, "2048", 0, 0, 0);
            ensureDef("llm", "llm.temperature", "温度", "0–1，越低越稳定", "NUMBER", null, "0.3", 0, 0, 0);
            ensureDef(
                    "llm",
                    "llm.auto_insight",
                    "每日审计后自动生成解读",
                    "在隔离服日/周/月清算完成后，为无缓存的记录调用大模型（约 1:30）",
                    "BOOLEAN",
                    null,
                    "true",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.auto_insight_on_open",
                    "打开 AI 解读弹窗时自动生成",
                    "已关闭推荐：请在弹窗内编辑提问后手动点击「发送」。开启后无缓存时将自动调用大模型",
                    "BOOLEAN",
                    null,
                    "false",
                    0,
                    0,
                    0);
            ensureDef(
                    "llm",
                    "llm.auto_insight_batch_limit",
                    "批量/日批最多条数",
                    "单次最多处理几条清算记录，避免一次消耗过多 token",
                    "NUMBER",
                    null,
                    "5",
                    0,
                    0,
                    0);
            for (LlmInsightModules.ModuleMeta mod : LlmInsightModules.all()) {
                ensureDef(
                        "llm",
                        LlmInsightModules.userPromptConfigKey(mod.reportKey()),
                        "解读提问 · " + mod.labelZh(),
                        "各业务模块点击「AI 解读」时预填的用户提问；弹窗内可修改并保存到本机",
                        "STRING",
                        null,
                        mod.defaultUserPrompt(),
                        0,
                        0,
                        0);
                ensureDef(
                        "llm",
                        LlmInsightModules.systemPromptConfigKey(mod.reportKey()),
                        "解读系统提示 · " + mod.labelZh(),
                        "可选：覆盖大模型系统角色说明；留空则使用内置 JSON 输出规范",
                        "STRING",
                        null,
                        "",
                        0,
                        0,
                        0);
            }
        } catch (Exception e) {
            log.warn("[llm] 配置定义初始化跳过: {}", e.getMessage());
        }
    }

    private void ensureDef(
            String module,
            String configKey,
            String labelZh,
            String description,
            String valueType,
            String optionsJson,
            String defaultValue,
            int isSensitive,
            int requiresRestart,
            int isPublic) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM sys_system_config_def WHERE module = ? AND config_key = ?",
                Integer.class,
                module,
                configKey);
        if (cnt != null && cnt > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                        INSERT INTO sys_system_config_def
                        (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                        """,
                module,
                configKey,
                labelZh,
                description,
                valueType,
                optionsJson,
                defaultValue,
                isSensitive,
                requiresRestart,
                isPublic);
        log.info("[llm] 已插入配置定义: {}.{}", module, configKey);
    }
}
