-- 各模块 AI 解读提问/系统提示（sys_system_config_def）
-- 在 twin_system 库执行；若应用已启动过，LlmConfigSeed 通常已插入定义，本脚本用于补环境或对照。
-- 配置值请在「系统设置 → 大模型」中维护，勿直接改 def 表 default_value 除非需重置默认文案。

-- 隔离服使用统计 · 用户提问（config_key = llm.insight_user_prompt.isolation_usage）
-- 隔离服使用统计 · 系统提示（config_key = llm.insight_system_prompt.isolation_usage，可留空用内置 JSON 规范）
