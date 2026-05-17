-- 大模型：备用模型与自动解读配置（已有库执行一次；新库由 LlmConfigSeed 启动时写入）
-- 目标库默认 twin_system

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT 'llm', 'llm.model_fallback', '备用模型列表',
       '逗号分隔，主模型失败或限流时依次尝试。无需填写全部 124 个模型，2～5 个即可',
       'STRING', NULL, 'qwen-turbo,qwen-plus,qwen-max', 0, 0, 0, NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_system_config_def d WHERE d.module = 'llm' AND d.config_key = 'llm.model_fallback');

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT 'llm', 'llm.auto_insight', '每日审计后自动生成解读',
       '在隔离服清算完成后，为无缓存的记录调用大模型', 'BOOLEAN', NULL, 'true', 0, 0, 0, NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_system_config_def d WHERE d.module = 'llm' AND d.config_key = 'llm.auto_insight');

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT 'llm', 'llm.auto_insight_on_open', '打开清算详情时自动生成',
       '选中清算记录且尚无解读时自动调用一次', 'BOOLEAN', NULL, 'true', 0, 0, 0, NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_system_config_def d WHERE d.module = 'llm' AND d.config_key = 'llm.auto_insight_on_open');

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT 'llm', 'llm.auto_insight_batch_limit', '批量/日批最多条数',
       '单次最多处理几条清算记录', 'NUMBER', NULL, '5', 0, 0, 0, NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_system_config_def d WHERE d.module = 'llm' AND d.config_key = 'llm.auto_insight_batch_limit');
