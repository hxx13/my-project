-- WinCC 归档自动清理配置（单行 id=1；与 twin_job_schedule_config 中 TELEMETRY_ARCHIVE_PURGE 配合）
CREATE TABLE IF NOT EXISTS telemetry_archive_purge_config (
    id TINYINT NOT NULL PRIMARY KEY COMMENT '固定 1',
    purge_enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否允许自动/手动清理',
    retention_days INT NOT NULL DEFAULT 14 COMMENT '保留最近 N 天样本',
    batch_delete_size INT NOT NULL DEFAULT 50000 COMMENT '每批 DELETE 行数上限',
    optimize_after_purge TINYINT NOT NULL DEFAULT 1 COMMENT '清理后 OPTIMIZE TABLE 释放空间',
    archive_write_enabled TINYINT NOT NULL DEFAULT 1 COMMENT 'WinCC 刷新是否继续写入归档',
    last_purge_at DATETIME NULL,
    last_purge_deleted_rows BIGINT NULL,
    last_purge_duration_ms INT NULL,
    updated_by VARCHAR(64) NULL,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='温湿度归档清理策略';

INSERT IGNORE INTO telemetry_archive_purge_config (id, purge_enabled, retention_days, batch_delete_size, optimize_after_purge, archive_write_enabled, updated_by)
VALUES (1, 1, 14, 50000, 1, 1, 'system-init');
