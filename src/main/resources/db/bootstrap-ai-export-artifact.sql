-- AI 对话导出产物：一次导出留下的「文件」。content 可空 —— 只是给过下载按钮、还没真下过时只有参数；
-- 用户真正下载后前端把那份字节交回此处归档，于是历史里再下拿到的与当时逐字节相同。
CREATE TABLE IF NOT EXISTS ai_export_artifact (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL COMMENT '所属会话（历史回放按它取）',
    message_id BIGINT NULL COMMENT '锚点：产出这条产物的那一轮 assistant 消息',
    user_id VARCHAR(50) NOT NULL COMMENT '产出人 user.id（JWT 解析所得，不接受外部传值）',
    kind VARCHAR(32) NOT NULL COMMENT '产物类型，如 materialAudit',
    label VARCHAR(255) NULL COMMENT '人话标签（同时进文件名）',
    filename VARCHAR(255) NULL COMMENT '下载时的建议文件名',
    params_json MEDIUMTEXT NULL COMMENT '这次导出是怎么配出来的（筛选 + 小计层级）；没存字节时靠它重跑',
    source_id BIGINT NULL COMMENT '这一份是从哪一份改出来的（原件为空），用于追溯「改了哪些」',
    content LONGBLOB NULL COMMENT '文件字节；用户第一次点下载时才写入',
    content_type VARCHAR(128) NULL,
    content_size BIGINT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_created (session_id, created_at),
    INDEX idx_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 对话导出产物（文件跟对话走）';
