-- 目标库：与 application.properties 中 spring.datasource.url 一致（默认 twin_system）
-- 站内信「已读游标」：用于好友入口 / 好友列表未读角标；须与 schema.sql 及 db/bootstrap-login-branding-invite-chat.sql 同步
-- 部署：可单独执行本脚本，或执行 scripts/login_branding_invite_chat.ddl.sql 全量（已内联本表）

CREATE TABLE IF NOT EXISTS chat_conversation_read (
    user_id VARCHAR(50) NOT NULL COMMENT '读游标所属用户',
    conversation_id VARCHAR(36) NOT NULL,
    last_read_at DATETIME(3) NOT NULL COMMENT '已读到该时间戳（含）之前的消息',
    PRIMARY KEY (user_id, conversation_id),
    KEY idx_ccr_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信会话已读游标（每人每会话一行）';
