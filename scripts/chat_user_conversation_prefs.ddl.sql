-- 站内信：每用户会话偏好（置顶、从本人列表隐藏）；与 schema.sql 保持一致。
-- 目标库（如 application.properties 中 twin_system）执行本脚本一次即可。

CREATE TABLE IF NOT EXISTS chat_user_conversation_prefs (
    user_id VARCHAR(50) NOT NULL COMMENT '偏好所属用户',
    conversation_id VARCHAR(36) NOT NULL,
    pinned TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=置顶',
    hidden_at DATETIME(3) NULL COMMENT '非空=本人已从会话列表移除（对方不受影响）',
    update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, conversation_id),
    KEY idx_cucp_user_hidden (user_id, hidden_at),
    KEY idx_cucp_conv (conversation_id),
    CONSTRAINT fk_cucp_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversation(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信会话每用户置顶与列表可见性';
