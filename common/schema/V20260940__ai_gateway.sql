-- AI 对话操作网关：会话 / 消息 / 挂起 / 工具调用审计
--
-- 归档记录。实际执行点见 AiGatewaySchemaMigrator（@Order(150)），本文件不参与启动执行。
-- 设计依据：docs/02-设计存档/计划文档/2026-10-08-AI对话操作网关-架构设计.md §12

CREATE TABLE IF NOT EXISTS ai_session (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         VARCHAR(50)  NOT NULL COMMENT '发起人 user.id（JWT 解析所得，字符串型雪花 id）',
    title           VARCHAR(255) NULL COMMENT '会话标题，取首条用户消息摘要',
    source          VARCHAR(16)  NULL COMMENT '载体: web/mp',
    context_page    VARCHAR(255) NULL COMMENT '载体上报的入口页面，仅用于路由',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 对话会话';

CREATE TABLE IF NOT EXISTS ai_message (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id          BIGINT      NOT NULL,
    seq                 INT         NOT NULL COMMENT '会话内序号',
    role                VARCHAR(16) NOT NULL COMMENT 'user/assistant/tool',
    content             MEDIUMTEXT  NULL COMMENT '原文，不归一化、不改写',
    raw_tool_calls      MEDIUMTEXT  NULL COMMENT '模型原始输出的 tool_calls JSON',
    tool_call_id        VARCHAR(64) NULL COMMENT 'role=tool 时对应哪次调用（OpenAI 协议要求，重放历史必需）',
    actor_user_id       VARCHAR(50) NULL COMMENT '发起人；user 轮才有',
    actor_role_snapshot VARCHAR(32) NULL COMMENT '发起人当时的角色快照，角色会变故必须存',
    source              VARCHAR(16) NULL,
    context_json        VARCHAR(512) NULL COMMENT '载体上报的页面/实体',
    model               VARCHAR(64) NULL,
    latency_ms          INT         NULL,
    prompt_tokens       INT         NULL,
    completion_tokens   INT         NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_seq (session_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 对话消息（append-only）';

CREATE TABLE IF NOT EXISTS ai_interaction (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id    BIGINT      NOT NULL,
    message_id    BIGINT      NULL COMMENT '发起挂起的那条 assistant 消息',
    token         VARCHAR(64) NOT NULL COMMENT '挂起凭证，前端凭此续跑',
    kind          VARCHAR(16) NOT NULL COMMENT 'confirm/clarify',
    question      TEXT        NULL,
    options_json  MEDIUMTEXT  NULL COMMENT '结构化选项，前端渲染为可点选控件',
    chosen_value  TEXT        NULL COMMENT '用户实际点了什么（可信输入，非模型生成）',
    status        VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/RESOLVED/EXPIRED',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at   DATETIME NULL,
    UNIQUE KEY uk_token (token),
    INDEX idx_session_status (session_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 对话挂起（澄清/确认）';

CREATE TABLE IF NOT EXISTS ai_tool_call_log (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id           BIGINT      NOT NULL,
    message_id           BIGINT      NULL,
    tool_name            VARCHAR(64) NOT NULL,
    raw_arguments        MEDIUMTEXT  NULL COMMENT '模型原样传的参数 JSON',
    required_capability  VARCHAR(64) NULL COMMENT '该工具声明的能力码',
    capability_granted   TINYINT(1)  NULL COMMENT '权限判定是否通过',
    denial_reason        VARCHAR(255) NULL,
    executed             TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '是否真的执行了（被拒/被确认拦下为 0）',
    raw_result           MEDIUMTEXT  NULL COMMENT '执行返回的原始响应',
    ok                   TINYINT(1)  NULL,
    error_message        VARCHAR(512) NULL,
    confirmed_by         VARCHAR(50) NULL COMMENT '写操作由谁点的确认',
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_tool_created (tool_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 工具调用审计（append-only，被拒绝的也记）';
