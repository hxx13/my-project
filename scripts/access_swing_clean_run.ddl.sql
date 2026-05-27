-- 门禁统计清洗：运行批次日志 + 明细归属批次（目标库 twin_system，启动前或随应用 migrator 执行）

CREATE TABLE IF NOT EXISTS access_swing_clean_run (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    channel_code VARCHAR(128) NOT NULL,
    package_id BIGINT NULL COMMENT '通道账本 access_clean_package.id',
    trigger_type VARCHAR(16) NOT NULL COMMENT 'MANUAL|SCHEDULED|RERUN',
    stats_task_ids_json VARCHAR(512) NULL,
    config_snapshot_json MEDIUMTEXT NULL COMMENT '试算/合并时的配置快照',
    incremental_after_time DATETIME NULL,
    window_start DATETIME NULL,
    window_end DATETIME NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'RUNNING' COMMENT 'RUNNING|DONE|FAILED|SUPERSEDED',
    total_scanned INT NOT NULL DEFAULT 0,
    included_count INT NOT NULL DEFAULT 0,
    excluded_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    superseded_by_run_id BIGINT NULL,
    error_message VARCHAR(512) NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    KEY idx_swing_clean_run_channel (channel_code, started_at),
    KEY idx_swing_clean_run_pkg (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE access_clean_package_item
    ADD COLUMN last_run_id BIGINT NULL COMMENT '最近一次写入本行的清洗批次' AFTER package_id;

ALTER TABLE access_clean_package_item
    ADD KEY idx_pkg_item_last_run (last_run_id);
