-- ============================================================
-- 邮箱验证码表
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_verification_code (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    scene VARCHAR(32) NOT NULL COMMENT 'FORGOT_PASSWORD | REGISTER | BIND_EMAIL',
    user_id VARCHAR(64) COMMENT '关联用户ID',
    used TINYINT NOT NULL DEFAULT 0,
    fail_count INT NOT NULL DEFAULT 0,
    reset_token VARCHAR(128),
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_scene (email, scene),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
