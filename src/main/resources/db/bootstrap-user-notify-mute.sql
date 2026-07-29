-- ============================================================
-- 个人通知偏好（用户视角二级开关）
-- 无记录 = 默认接收所有；有记录 enabled=0 = 用户手动关闭
-- source_code 通过 notify_source 实时同步，前端展示所有可用源
-- ============================================================
CREATE TABLE IF NOT EXISTS user_notify_mute (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID',
    source_code VARCHAR(64) NOT NULL COMMENT '对应 notify_source.source_code',
    enabled TINYINT DEFAULT 1 COMMENT '1=接收 0=拒收',
    mute_email TINYINT DEFAULT 0 COMMENT '0=不静默 1=拒收邮件',
    mute_server_chan TINYINT DEFAULT 0 COMMENT '0=不静默 1=拒收Server酱',
    mute_wxpusher TINYINT DEFAULT 0 COMMENT '0=不静默 1=拒收WxPusher',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_source (user_id, source_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE user_notify_mute MODIFY COLUMN enabled TINYINT DEFAULT 1;
