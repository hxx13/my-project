-- 目标库：与 application.properties 中 spring.datasource.url 一致（默认 twin_system）
-- 站内一对一私聊核心表（缺表时 open conversation 会报 BadSqlGrammarException）
-- 与 src/main/resources/schema.sql 中定义一致；可重复执行

CREATE TABLE IF NOT EXISTS chat_conversation (
    id VARCHAR(36) PRIMARY KEY,
    min_user_id VARCHAR(50) NOT NULL,
    max_user_id VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at DATETIME NULL,
    UNIQUE KEY uk_chat_dm (min_user_id, max_user_id),
    KEY idx_chat_min (min_user_id),
    KEY idx_chat_max (max_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教职工一对一对话';

CREATE TABLE IF NOT EXISTS chat_attachment (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    storage_key VARCHAR(512) NOT NULL COMMENT '本地相对路径或未来 OSS key',
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hex CHAR(64) NULL,
    uploaded_by VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_chat_att_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信附件元数据';

CREATE TABLE IF NOT EXISTS chat_message (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(50) NOT NULL,
    body TEXT NULL,
    attachment_id VARCHAR(36) NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_msg_conv_time (conversation_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信消息';

CREATE TABLE IF NOT EXISTS chat_conversation_read (
    user_id VARCHAR(50) NOT NULL COMMENT '读游标所属用户',
    conversation_id VARCHAR(36) NOT NULL,
    last_read_at DATETIME(3) NOT NULL COMMENT '已读到该时间戳（含）之前的消息',
    PRIMARY KEY (user_id, conversation_id),
    KEY idx_ccr_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信会话已读游标（每人每会话一行）';
