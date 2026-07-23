-- 系统配置表（NotificationSettings 模块核心表）
-- 幂等：CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS sys_system_config_def (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    module          VARCHAR(64)  NOT NULL,
    config_key      VARCHAR(128) NOT NULL,
    label_zh        VARCHAR(256),
    description     TEXT,
    value_type      VARCHAR(32)  DEFAULT 'STRING',
    options_json    TEXT,
    default_value   VARCHAR(512),
    is_sensitive    TINYINT(1)   DEFAULT 0,
    requires_restart TINYINT(1)  DEFAULT 0,
    is_public       TINYINT(1)   DEFAULT 0,
    update_time     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_system_config (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    module          VARCHAR(64)  NOT NULL,
    config_key      VARCHAR(128) NOT NULL,
    config_value    TEXT,
    value_type      VARCHAR(32)  DEFAULT 'STRING',
    remark          TEXT,
    update_time     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sys_system_config_audit (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    config_id       BIGINT,
    module          VARCHAR(64),
    config_key      VARCHAR(128),
    old_value       TEXT,
    new_value       TEXT,
    operator_id     BIGINT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
