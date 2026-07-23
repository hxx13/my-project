CREATE TABLE IF NOT EXISTS user_aro_binding (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL COMMENT 'sys_user.id',
    aro_user_id VARCHAR(50) NOT NULL COMMENT 'aro_personnel.user_id',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user (user_id),
    UNIQUE KEY uk_aro_user (aro_user_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
