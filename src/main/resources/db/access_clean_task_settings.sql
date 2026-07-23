CREATE TABLE IF NOT EXISTS access_clean_task_settings (
    stats_task_id BIGINT NOT NULL PRIMARY KEY COMMENT '统计拉取任务ID',
    debounce_seconds INT NOT NULL DEFAULT 45 COMMENT '同人同通道去抖间隔秒',
    auto_clean_package TINYINT NOT NULL DEFAULT 1 COMMENT '1=定时自动清洗打包；0=仅手动（历史回溯）',
    swing_direction_filter VARCHAR(8) NOT NULL DEFAULT 'ALL' COMMENT 'ALL|ENTER|EXIT，清洗默认进出筛选',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
