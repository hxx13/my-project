-- 门禁清洗工作区：按统计拉取任务绑定规则 + 清洗数据包
-- 目标库见 application.properties（如 twin_system），升级时执行一次

ALTER TABLE access_door_rule
    ADD COLUMN stats_task_id BIGINT NOT NULL DEFAULT 0 COMMENT '统计拉取任务ID，0=全局默认' AFTER rule_set_id;

ALTER TABLE access_door_rule DROP INDEX uk_access_door_rule_channel;

ALTER TABLE access_door_rule
    ADD UNIQUE KEY uk_access_door_rule_task_channel (stats_task_id, channel_code);

CREATE TABLE IF NOT EXISTS access_clean_package (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stats_task_id BIGINT NOT NULL COMMENT '统计拉取任务',
    package_name VARCHAR(128) NOT NULL,
    window_start DATETIME NULL,
    window_end DATETIME NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|PUBLISHED',
    total_scanned INT NOT NULL DEFAULT 0,
    included_count INT NOT NULL DEFAULT 0,
    excluded_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_clean_package_task (stats_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='清洗后数据包（每任务唯一，更新覆盖不保留历史）';

CREATE TABLE IF NOT EXISTS access_clean_package_item (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    package_id BIGINT NOT NULL,
    swing_row_id BIGINT NULL COMMENT 'twin_dahua_swing_record.id',
    record_id VARCHAR(128) NOT NULL,
    swing_time DATETIME NOT NULL,
    channel_code VARCHAR(128) NOT NULL,
    channel_name VARCHAR(256) NULL,
    person_code VARCHAR(64) NULL,
    person_name VARCHAR(128) NULL,
    mapping_user_id VARCHAR(64) NULL,
    disposition VARCHAR(24) NOT NULL COMMENT 'INCLUDED|EXCLUDED',
    auto_reason VARCHAR(128) NULL,
    manual_override VARCHAR(24) NULL COMMENT 'FORCE_INCLUDE|FORCE_EXCLUDE|null',
    manual_verdict VARCHAR(16) NULL COMMENT 'CONFIRMED|REJECTED|null',
    direction VARCHAR(8) NULL,
    direction_override VARCHAR(8) NULL,
    flags_json VARCHAR(512) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_package_record (package_id, record_id),
    KEY idx_package_item_disp (package_id, disposition),
    CONSTRAINT fk_package_item_pkg FOREIGN KEY (package_id) REFERENCES access_clean_package(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='数据包明细（原记录不删，仅标记纳入/排除）';
