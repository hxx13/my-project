-- 统计页 AI 综合分析对话（多轮、按用户持久化）
-- 目标库 twin_system；应用启动时 AnalyticsSchemaMigrator 也会 CREATE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS analytics_chat_session (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    report_key VARCHAR(64) NOT NULL,
    view_id BIGINT NOT NULL,
    view_name VARCHAR(128) NOT NULL DEFAULT '',
    title VARCHAR(128) NOT NULL DEFAULT '新对话',
    context_json MEDIUMTEXT NULL COMMENT '封箱时的多期统计数据',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_acs_user_report (user_id, report_key, updated_at),
    KEY idx_acs_view (view_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计页-AI对话会话';

CREATE TABLE IF NOT EXISTS analytics_chat_message (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    role VARCHAR(16) NOT NULL COMMENT 'user|assistant|system',
    content MEDIUMTEXT NOT NULL,
    thinking_text TEXT NULL COMMENT '深度思考过程展示',
    model VARCHAR(64) NULL,
    prompt_tokens INT NULL,
    completion_tokens INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_acm_session (session_id, id),
    CONSTRAINT fk_acm_session FOREIGN KEY (session_id) REFERENCES analytics_chat_session(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计页-AI对话消息';
