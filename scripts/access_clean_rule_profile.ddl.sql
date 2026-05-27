-- 清洗规则方案 + 执行日志 + 审计任务绑定（目标库见 application.properties，默认 twin_system）

CREATE TABLE IF NOT EXISTS access_clean_rule_profile (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512) NULL,
    debounce_seconds INT NOT NULL DEFAULT 45,
    swing_direction_filter VARCHAR(8) NOT NULL DEFAULT 'ALL',
    auto_clean_package TINYINT NOT NULL DEFAULT 1,
    require_mapping TINYINT NOT NULL DEFAULT 0 COMMENT '0=不限制映射;1=仅已映射用户',
    open_success_only TINYINT NOT NULL DEFAULT 1,
    default_door_mode VARCHAR(32) NULL DEFAULT 'DAHUA_ENTER_EXIT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_clean_rule_profile_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_clean_execution_log (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stats_pull_task_id BIGINT NULL,
    clean_rule_profile_id BIGINT NULL,
    execution_date DATE NOT NULL,
    window_start DATETIME NULL,
    window_end DATETIME NULL,
    channel_codes_json VARCHAR(2048) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'SUCCESS',
    total_scanned INT NOT NULL DEFAULT 0,
    included_count INT NOT NULL DEFAULT 0,
    excluded_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    config_snapshot_json MEDIUMTEXT NULL,
    note_text VARCHAR(1024) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_exec_log_task_date (stats_pull_task_id, execution_date),
    KEY idx_exec_log_profile_date (clean_rule_profile_id, execution_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE twin_dahua_stats_pull_task
    ADD COLUMN clean_rule_profile_id BIGINT NULL COMMENT '绑定的清洗规则方案' AFTER query_json;
