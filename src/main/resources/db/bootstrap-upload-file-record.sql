CREATE TABLE IF NOT EXISTS `upload_file_record` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT  COMMENT '主键',
    `storage_key`      VARCHAR(255) NOT NULL                 COMMENT '后端存储相对路径，如 20260611/uuid.jpg',
    `public_url`       VARCHAR(512) NOT NULL                 COMMENT '公网可访问的完整 URL',
    `wechat_file_id`   VARCHAR(512) DEFAULT NULL             COMMENT '微信云存储 fileID（cloud://xxx），Web 上传后由云函数异步补填',
    `original_name`    VARCHAR(255) DEFAULT NULL             COMMENT '原始文件名',
    `mime_type`        VARCHAR(100) DEFAULT NULL             COMMENT 'MIME 类型，如 image/jpeg',
    `size_bytes`       BIGINT       DEFAULT 0               COMMENT '文件大小（字节）',
    `source`           VARCHAR(20)  NOT NULL DEFAULT 'WEB'   COMMENT '来源：WEB / MINIPROGRAM',
    `synced_to_wechat` TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '是否已同步到微信云存储',
    `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    INDEX `idx_wechat_file_id` (`wechat_file_id`(255)),
    INDEX `idx_synced_to_wechat` (`synced_to_wechat`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='上传文件记录表 — 关联微信云存储 fileID 与公网 URL';
