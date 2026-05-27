-- 增量：规则绑定任务 + 清洗数据包（重复执行时忽略已存在列/索引错误）

ALTER TABLE access_door_rule
    ADD COLUMN stats_task_id BIGINT NOT NULL DEFAULT 0 COMMENT '统计拉取任务ID' AFTER rule_set_id;

ALTER TABLE access_door_rule DROP INDEX uk_access_door_rule_channel;

ALTER TABLE access_door_rule
    ADD UNIQUE KEY uk_access_door_rule_task_channel (stats_task_id, channel_code);

CREATE TABLE IF NOT EXISTS access_clean_package (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stats_task_id BIGINT NOT NULL DEFAULT 0,
    channel_code VARCHAR(128) NOT NULL,
    package_name VARCHAR(128) NOT NULL,
    window_start DATETIME NULL,
    window_end DATETIME NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    total_scanned INT NOT NULL DEFAULT 0,
    included_count INT NOT NULL DEFAULT 0,
    excluded_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    published_at DATETIME NULL,
    last_merged_swing_time DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_clean_package_channel (channel_code),
    KEY idx_clean_package_task (stats_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_clean_package_item (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    package_id BIGINT NOT NULL,
    swing_row_id BIGINT NULL,
    record_id VARCHAR(128) NOT NULL,
    swing_time DATETIME NOT NULL,
    channel_code VARCHAR(128) NOT NULL,
    channel_name VARCHAR(256) NULL,
    person_code VARCHAR(64) NULL,
    person_name VARCHAR(128) NULL,
    mapping_user_id VARCHAR(64) NULL,
    department_id VARCHAR(50) NULL,
    department_name VARCHAR(128) NULL,
    audience_type VARCHAR(16) NULL,
    disposition VARCHAR(24) NOT NULL,
    auto_reason VARCHAR(128) NULL,
    manual_override VARCHAR(24) NULL,
    manual_verdict VARCHAR(16) NULL,
    direction VARCHAR(8) NULL,
    direction_override VARCHAR(8) NULL,
    flags_json VARCHAR(512) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_package_record (package_id, record_id),
    KEY idx_package_item_disp (package_id, disposition)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
