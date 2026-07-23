-- 学生手机端直达 Token（v2：时效 + 反分享 + 唯一活跃）
-- 每人最多 1 个活跃 token，重新生成时旧 token 立即失效
-- 多 IP 使用同一 token 时，该用户全部 token 立即失效
CREATE TABLE IF NOT EXISTS student_mobile_token (
    id          BIGINT       AUTO_INCREMENT PRIMARY KEY,
    token       VARCHAR(64)  NOT NULL UNIQUE COMMENT '随机 token 串',
    user_id     VARCHAR(64)  NOT NULL COMMENT '关联 sys_user.id',
    expires_at  DATETIME     NOT NULL COMMENT '过期时间',
    last_ip     VARCHAR(64)  DEFAULT NULL COMMENT '首次访问IP，用于反分享检测',
    is_active   TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=活跃 0=已失效',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_token   (token),
    INDEX idx_user_id (user_id),
    INDEX idx_active  (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生手机端直达Token v2';
