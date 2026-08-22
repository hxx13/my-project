-- NHP notification（archive; runtime bootstrap-nhp-notification.sql）
-- V20260821039：通知中心未读角标持久化（28 §七 / 29 契约）

CREATE TABLE IF NOT EXISTS crf_notification (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    VARCHAR(64)  NULL COMMENT '接收人（空=广播占位）',
    type       VARCHAR(20)  NOT NULL COMMENT 'REVIEW/QUALITY/TODO/VERSION',
    ref_type   VARCHAR(32)  NULL COMMENT 'field/record/codelist/quality_event/todo',
    ref_id     BIGINT       NULL,
    title      VARCHAR(256) NOT NULL COMMENT '通知正文',
    `read`     TINYINT      NOT NULL DEFAULT 0 COMMENT '0未读/1已读',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_notif_user (user_id),
    KEY idx_crf_notif_type (type),
    KEY idx_crf_notif_read (`read`),
    KEY idx_crf_notif_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP 通知消息流';
