CREATE TABLE IF NOT EXISTS notify_source (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_code VARCHAR(64) NOT NULL,
    source_name VARCHAR(128) NOT NULL,
    description VARCHAR(512),
    variables TEXT COMMENT 'JSON: {"varName":"说明"}',
    enabled TINYINT DEFAULT 1,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_source_code (source_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notify_source_channel (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_id BIGINT NOT NULL,
    channel_code VARCHAR(32) NOT NULL,
    enabled TINYINT DEFAULT 1,
    title_tpl VARCHAR(256) NOT NULL,
    content_tpl TEXT NOT NULL,
    quiet_start TIME DEFAULT NULL,
    quiet_end TIME DEFAULT NULL,
    rate_limit_seconds INT DEFAULT 300,
    UNIQUE KEY uk_source_channel (source_id, channel_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notify_source_recipient (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_id BIGINT NOT NULL,
    perspective VARCHAR(16) NOT NULL COMMENT 'STUDENT | STAFF | ALL',
    scope_type VARCHAR(16) DEFAULT 'ALL' COMMENT 'ALL | ROLE | USER',
    scope_value VARCHAR(128) COMMENT '单用户ID（每人一行）'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- scope_value 宽度修复由 PushColumnEnsurer 在启动时幂等执行

-- Extend sys_notify_delivery_log (NO next_retry_at — reuse existing next_retry_time)
ALTER TABLE sys_notify_delivery_log ADD COLUMN source_code VARCHAR(64) DEFAULT NULL;
ALTER TABLE sys_notify_delivery_log ADD COLUMN source_name VARCHAR(128) DEFAULT NULL;
ALTER TABLE sys_notify_delivery_log ADD COLUMN channel_name VARCHAR(32) DEFAULT NULL;
ALTER TABLE sys_notify_delivery_log ADD COLUMN recipient_name VARCHAR(64) DEFAULT NULL;
ALTER TABLE sys_notify_delivery_log ADD COLUMN title VARCHAR(256) DEFAULT NULL;
ALTER TABLE sys_notify_delivery_log ADD COLUMN content TEXT DEFAULT NULL;
ALTER TABLE sys_notify_delivery_log ADD COLUMN max_retries INT DEFAULT 3;

-- aro_personnel 的 contact_email / send_key 列由 PushColumnEnsurer 启动时确保，不在此处 ALTER
