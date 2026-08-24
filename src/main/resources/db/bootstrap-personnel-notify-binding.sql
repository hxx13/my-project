CREATE TABLE IF NOT EXISTS personnel_notify_binding (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    personnel_id  BIGINT       NOT NULL COMMENT 'personnel.id 锚点',
    channel_code  VARCHAR(32)  NOT NULL COMMENT 'EMAIL | SERVER_CHAN | WXPUSHER',
    target_value  VARCHAR(256) NOT NULL COMMENT '投递目标(邮箱/SendKey/WxPusher UID)',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_personnel_channel (personnel_id, channel_code),
    KEY idx_binding_personnel (personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知渠道绑定(一人一渠道一行)';
