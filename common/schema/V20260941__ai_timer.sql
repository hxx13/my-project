-- 归档文件（服务器手工执行 / 版本记录）。本地与启动时由启动链自动执行：
--   src/main/resources/db/bootstrap-ai-timer.sql
--   注册点：common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.runAllScripts()
-- 设计：docs/02-设计存档/计划文档/2026-10-09-AI计时器与通用工具调度-设计.md

CREATE TABLE IF NOT EXISTS ai_timer (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id VARCHAR(50) NOT NULL COMMENT '建单人 user.id（JWT 解析所得）',
    owner_name_snapshot VARCHAR(128) NULL COMMENT '建单人姓名快照',
    owner_role_snapshot VARCHAR(32) NULL COMMENT '建单人当时的角色快照',
    label VARCHAR(255) NULL COMMENT '人话标签，模型写的',
    tool_name VARCHAR(64) NOT NULL COMMENT '到点要执行的工具',
    args_json MEDIUMTEXT NULL COMMENT '工具参数原文 JSON',
    fire_at DATETIME NOT NULL COMMENT '绝对触发时间 —— 唯一时间锚点',
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    session_id BIGINT NULL,
    message_id BIGINT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME NULL,
    fired_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    confirmed_by VARCHAR(50) NULL,
    result_text MEDIUMTEXT NULL,
    ok TINYINT(1) NULL,
    error_message VARCHAR(512) NULL,
    deleted TINYINT NOT NULL DEFAULT 0,
    INDEX idx_status_fire (status, fire_at),
    INDEX idx_owner_created (owner_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 计时器（大模型定时执行工具）';
