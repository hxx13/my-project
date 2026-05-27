-- 任务级清洗去抖（非按通道）
-- 目标库见 application.properties（如 twin_system）

CREATE TABLE IF NOT EXISTS access_clean_task_settings (
    stats_task_id BIGINT NOT NULL PRIMARY KEY COMMENT '统计拉取任务ID',
    debounce_seconds INT NOT NULL DEFAULT 45 COMMENT '同通道去抖间隔秒',
    auto_clean_package TINYINT NOT NULL DEFAULT 1 COMMENT '1=定时自动清洗打包；0=仅手动',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门禁清洗任务级参数';
