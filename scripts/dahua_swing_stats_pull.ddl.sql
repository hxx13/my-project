-- 统计用门禁批量拉取任务（与 twin_dahua_pull_task 即时任务分离）
-- 目标库 twin_system

CREATE TABLE IF NOT EXISTS twin_dahua_stats_pull_task (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    period_mode VARCHAR(32) NOT NULL DEFAULT 'PREVIOUS_DAY' COMMENT 'PREVIOUS_DAY|PREVIOUS_WEEK|HISTORICAL_RANGE|SINCE_LAST',
    period_days INT NOT NULL DEFAULT 1 COMMENT 'CUSTOM_DAYS 时回溯完整自然日天数',
    query_json TEXT NOT NULL COMMENT '大华筛选条件+execWeekDays/execStartTime/execEndTime',
    last_pulled_start DATETIME NULL,
    last_pulled_end DATETIME NULL,
    last_status VARCHAR(32) NULL,
    last_error TEXT NULL,
    last_run_at DATETIME NULL,
    last_saved_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_stats_pull_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计/审计门禁批量拉取任务';

-- 区分即时拉取与统计拉取写入（若列已存在可跳过）
ALTER TABLE twin_dahua_swing_record
    ADD COLUMN pull_task_type VARCHAR(16) NOT NULL DEFAULT 'REALTIME' COMMENT 'REALTIME|STATS' AFTER task_id;
