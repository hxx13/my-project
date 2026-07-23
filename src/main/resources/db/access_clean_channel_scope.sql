CREATE TABLE IF NOT EXISTS access_clean_channel_scope (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stats_task_id BIGINT NOT NULL,
    channel_code VARCHAR(128) NOT NULL,
    channel_name VARCHAR(256) NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_clean_scope_task_channel (stats_task_id, channel_code),
    KEY idx_clean_scope_task (stats_task_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
