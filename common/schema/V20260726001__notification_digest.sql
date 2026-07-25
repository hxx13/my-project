-- ============================================================
-- 通知聚合架构：默认模板 + 个人偏好 + 缓冲表
-- ============================================================

-- 1. 平台默认聚合配置（管理员编辑，每通知源一条）
CREATE TABLE IF NOT EXISTS notify_digest_default_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_code VARCHAR(64) NOT NULL UNIQUE,
    digest_mode VARCHAR(32) NOT NULL DEFAULT 'INSTANT' COMMENT 'INSTANT | HOURLY | TWICE_DAILY | DAILY',
    schedule_times VARCHAR(128) COMMENT '逗号分隔，如 09:00,18:00',
    overflow_strategy VARCHAR(32) NOT NULL DEFAULT 'ROLL_OVER' COMMENT 'ROLL_OVER | FALLBACK_INSTANT',
    digest_title_tpl VARCHAR(255) COMMENT '摘要标题模板，{userName} {count}',
    digest_content_tpl VARCHAR(2000) COMMENT '摘要内容模板',
    enabled TINYINT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 个人聚合偏好覆盖（用户维度，NULL = 继承默认）
CREATE TABLE IF NOT EXISTS user_digest_preference (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    source_code VARCHAR(64) NOT NULL,
    digest_mode VARCHAR(32) COMMENT 'NULL=继承默认',
    schedule_times VARCHAR(128) COMMENT 'NULL=继承默认',
    overflow_strategy VARCHAR(32) COMMENT 'NULL=继承默认',
    enabled TINYINT COMMENT 'NULL=继承默认',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_source (user_id, source_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 聚合缓冲表（DIGEST 模式通知暂存于此）
CREATE TABLE IF NOT EXISTS notify_digest_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    source_code VARCHAR(64) NOT NULL,
    channel_code VARCHAR(32) NOT NULL,
    title VARCHAR(500),
    content TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING | SENT',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    send_time DATETIME,
    INDEX idx_user_status (user_id, status),
    INDEX idx_status_time (status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. notify_source_channel 加 digest_mode（MySQL 兼容写法）
-- ALTER TABLE notify_source_channel ADD COLUMN digest_mode ... （如已存在则跳过）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notify_source_channel' AND COLUMN_NAME = 'digest_mode');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE notify_source_channel ADD COLUMN digest_mode VARCHAR(32) NOT NULL DEFAULT ''INSTANT'' COMMENT ''INSTANT | HOURLY | TWICE_DAILY | DAILY''',
    'SELECT ''column digest_mode already exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
