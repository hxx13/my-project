-- V20260703__llm_conversation.sql
-- AI 对话会话与消息存储（ScanAssistant / Analytics AI Chat / 未来扩展）

CREATE TABLE IF NOT EXISTS llm_conversation_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_type VARCHAR(32) NOT NULL DEFAULT 'scan_assistant' COMMENT '会话类型: scan_assistant / analytics_chat / custom',
    title VARCHAR(200) DEFAULT '' COMMENT '会话标题',
    status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active / archived / compressed',
    context_summary TEXT COMMENT '压缩后的上下文摘要（旧消息压缩后存此）',
    model VARCHAR(64) DEFAULT '' COMMENT '使用的模型名',
    token_count_total INT NOT NULL DEFAULT 0 COMMENT '累计token消耗',
    metadata_json TEXT COMMENT '扩展元数据JSON',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_type (session_type),
    INDEX idx_status (status),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI对话会话';

CREATE TABLE IF NOT EXISTS llm_conversation_message (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL COMMENT '关联会话ID',
    role VARCHAR(16) NOT NULL COMMENT 'system / user / assistant',
    content TEXT NOT NULL COMMENT '消息内容',
    token_count INT NOT NULL DEFAULT 0 COMMENT '本条消息token数',
    is_compressed TINYINT NOT NULL DEFAULT 0 COMMENT '是否已被压缩到context_summary',
    metadata_json TEXT COMMENT '扩展元数据JSON',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI对话消息';
