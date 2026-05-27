-- 门禁清洗统计管线（accessfusion）
-- 目标库：与 application.properties 中 spring.datasource 一致（如 twin_system）
-- 启动应用前或升级时执行本脚本一次

CREATE TABLE IF NOT EXISTS access_door_rule (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rule_set_id BIGINT NOT NULL DEFAULT 1 COMMENT '规则集版本',
    stats_task_id BIGINT NOT NULL DEFAULT 0 COMMENT '统计拉取任务ID',
    channel_code VARCHAR(128) NOT NULL COMMENT '大华通道编码',
    channel_name VARCHAR(256) NULL,
    door_mode VARCHAR(32) NOT NULL DEFAULT 'DAHUA_ENTER_EXIT' COMMENT 'ENTRY_ONLY|EXIT_ONLY|BIDIRECTIONAL_TOGGLE|DAHUA_ENTER_EXIT',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁统计方向规则';

CREATE TABLE IF NOT EXISTS access_raw_event (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(32) NOT NULL COMMENT 'DAHUA_PULL|DAHUA_WEBHOOK',
    record_id VARCHAR(128) NOT NULL COMMENT '大华记录唯一键',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='归一化门禁原始事件';

CREATE TABLE IF NOT EXISTS access_clean_batch (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_type VARCHAR(32) NOT NULL COMMENT 'DAILY|INCREMENTAL|MANUAL',
    window_start DATETIME NOT NULL,
    window_end DATETIME NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'RUNNING' COMMENT 'RUNNING|DONE|FAILED',
    raw_in INT NOT NULL DEFAULT 0,
    cleaned_out INT NOT NULL DEFAULT 0,
    visit_out INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    error_message VARCHAR(512) NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    KEY idx_access_clean_batch_window (window_start, window_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='清洗批次';

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
    direction VARCHAR(8) NOT NULL COMMENT 'ENTER|EXIT',
    access_type TINYINT NOT NULL COMMENT '1=进入 2=离开',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='清洗后进出事件';

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
    status VARCHAR(16) NOT NULL COMMENT 'COMPLETE|OPEN|ORPHAN_EXIT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_access_visit_user_date (user_id, round_date),
    KEY idx_access_visit_room_date (room_id, round_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='进出轮次';

-- 见 scripts/access_audit_source.ddl.sql（审计一级库筛选配置，亦可单独执行该文件）
