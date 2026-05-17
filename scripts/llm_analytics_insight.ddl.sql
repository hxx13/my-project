-- 大模型对统计审计快照的解读结果（按清算记录缓存）
-- 目标库默认 twin_system（见 application.properties spring.datasource.url）
-- 启动应用前在目标库执行本脚本，或执行 schema.sql 中同名段落

CREATE TABLE IF NOT EXISTS analytics_llm_insight (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    audit_log_id BIGINT NOT NULL COMMENT 'analytics_audit_log.id',
    user_id VARCHAR(64) NOT NULL COMMENT '生成者',
    model VARCHAR(64) NOT NULL DEFAULT '',
    prompt_tokens INT NULL,
    completion_tokens INT NULL,
    insight_json JSON NOT NULL COMMENT '结构化解读（headline、图表建议等）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ali_audit (audit_log_id),
    KEY idx_ali_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-大模型解读缓存';
