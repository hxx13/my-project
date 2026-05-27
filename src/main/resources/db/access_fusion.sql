-- 与 scripts/access_fusion.ddl.sql 保持同步（应用启动时 AccessFusionSchemaMigrator 执行）

CREATE TABLE IF NOT EXISTS access_door_rule (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rule_set_id BIGINT NOT NULL DEFAULT 1,
    stats_task_id BIGINT NOT NULL DEFAULT 0 COMMENT '统计拉取任务ID，0=全局默认',
    channel_code VARCHAR(128) NOT NULL,
    channel_name VARCHAR(256) NULL,
    door_mode VARCHAR(32) NOT NULL DEFAULT 'BIDIRECTIONAL_TOGGLE',
    paired_entry_channel VARCHAR(128) NULL,
    paired_exit_channel VARCHAR(128) NULL,
    zone_id VARCHAR(64) NULL,
    campus VARCHAR(128) NULL,
    floor VARCHAR(64) NULL,
    debounce_seconds INT NOT NULL DEFAULT 45,
    max_swipes_per_minute INT NOT NULL DEFAULT 8,
    enabled TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_access_door_rule_task_channel (stats_task_id, channel_code),
    KEY idx_access_door_rule_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_raw_event (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(32) NOT NULL,
    record_id VARCHAR(128) NOT NULL,
    swing_task_id BIGINT NULL,
    swing_time DATETIME NOT NULL,
    card_number VARCHAR(64) NULL,
    channel_code VARCHAR(128) NOT NULL,
    channel_name VARCHAR(256) NULL,
    person_code VARCHAR(64) NULL,
    person_name VARCHAR(128) NULL,
    department_id VARCHAR(50) NULL,
    department_name VARCHAR(128) NULL,
    mapping_user_id VARCHAR(64) NULL,
    dahua_enter_or_exit INT NULL,
    open_result INT NULL,
    raw_json MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_access_raw_source_record (source, record_id),
    KEY idx_access_raw_swing_time (swing_time),
    KEY idx_access_raw_user_time (mapping_user_id, swing_time),
    KEY idx_access_raw_channel_time (channel_code, swing_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_clean_batch (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_type VARCHAR(32) NOT NULL,
    window_start DATETIME NOT NULL,
    window_end DATETIME NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
    raw_in INT NOT NULL DEFAULT 0,
    cleaned_out INT NOT NULL DEFAULT 0,
    visit_out INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    error_message VARCHAR(512) NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    KEY idx_access_clean_batch_window (window_start, window_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_cleaned_event (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NULL,
    raw_event_id BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    person_name VARCHAR(128) NULL,
    channel_code VARCHAR(128) NOT NULL,
    room_id VARCHAR(64) NULL,
    room_name VARCHAR(256) NULL,
    area_name VARCHAR(256) NULL,
    floor_name VARCHAR(128) NULL,
    direction VARCHAR(8) NOT NULL,
    access_type TINYINT NOT NULL,
    inference_method VARCHAR(32) NOT NULL,
    confidence INT NOT NULL DEFAULT 80,
    flags_json VARCHAR(512) NULL,
    project_group_names VARCHAR(512) NULL,
    event_time DATETIME NOT NULL,
    needs_review TINYINT NOT NULL DEFAULT 0,
    ai_suggested_direction VARCHAR(8) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_access_cleaned_raw (raw_event_id),
    KEY idx_access_cleaned_agg (event_time, user_id, room_id),
    KEY idx_access_cleaned_review (needs_review, event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_visit_round (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_id BIGINT NULL,
    user_id VARCHAR(64) NOT NULL,
    room_id VARCHAR(64) NULL,
    room_name VARCHAR(256) NULL,
    round_date DATE NOT NULL,
    enter_time DATETIME NULL,
    exit_time DATETIME NULL,
    enter_cleaned_event_id BIGINT NULL,
    exit_cleaned_event_id BIGINT NULL,
    status VARCHAR(16) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_access_visit_user_date (user_id, round_date),
    KEY idx_access_visit_room_date (room_id, round_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_audit_source_config (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    swing_task_id BIGINT NULL,
    channel_code VARCHAR(128) NULL,
    person_code VARCHAR(64) NULL,
    person_name VARCHAR(128) NULL,
    open_type INT NULL,
    require_mapping TINYINT NOT NULL DEFAULT 0,
    open_success_only TINYINT NOT NULL DEFAULT 1,
    auto_sync_enabled TINYINT NOT NULL DEFAULT 0,
    last_sync_at DATETIME NULL,
    last_sync_count INT NOT NULL DEFAULT 0,
    last_preview_swing_count INT NOT NULL DEFAULT 0,
    last_preview_raw_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_access_audit_source_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS access_clean_package (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stats_task_id BIGINT NOT NULL,
    package_name VARCHAR(128) NOT NULL,
    window_start DATETIME NULL,
    window_end DATETIME NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    total_scanned INT NOT NULL DEFAULT 0,
    included_count INT NOT NULL DEFAULT 0,
    excluded_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_clean_package_task (stats_task_id, status)
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
