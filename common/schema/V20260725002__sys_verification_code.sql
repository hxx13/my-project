CREATE TABLE IF NOT EXISTS sys_verification_code (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(256) NOT NULL COMMENT '目标邮箱',
    code        VARCHAR(6)   NOT NULL COMMENT '6位数字验证码',
    scene       VARCHAR(32)  NOT NULL COMMENT '场景：BIND_EMAIL / FORGOT_PASSWORD',
    used        TINYINT      NOT NULL DEFAULT 0 COMMENT '0未使用 1已验证 2已消费(重置用)',
    fail_count  INT          NOT NULL DEFAULT 0 COMMENT '错误尝试次数',
    reset_token VARCHAR(64)  NULL COMMENT '一次性重置令牌(UUID)，验证通过后生成',
    expires_at  DATETIME     NOT NULL COMMENT '过期时间',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_scene (email, scene),
    INDEX idx_reset_token (reset_token),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮箱验证码';
