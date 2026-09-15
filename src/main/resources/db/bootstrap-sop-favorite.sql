-- SOP 文档收藏：按人存，跨设备可见（不落 localStorage）
CREATE TABLE IF NOT EXISTS sop_favorite (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL COMMENT 'sys_user.id',
    document_id BIGINT      NOT NULL COMMENT 'sop_document.id',
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sop_favorite (user_id, document_id),
    KEY idx_sop_favorite_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SOP 文档收藏';
