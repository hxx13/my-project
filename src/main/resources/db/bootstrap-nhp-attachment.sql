-- NHP 表单实例附件关联（镜像 aup_attachment；字段 value 引用 upload_file_record.id）
CREATE TABLE IF NOT EXISTS crf_attachment (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id  BIGINT       NOT NULL COMMENT 'FK→crf_record.id',
    file_id    BIGINT       NOT NULL COMMENT 'FK→upload_file_record.id',
    file_name  VARCHAR(255) NULL,
    created_by VARCHAR(64)  NULL,
    deleted    TINYINT      NOT NULL DEFAULT 0 COMMENT '软删',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_attach_record (record_id),
    KEY idx_crf_attach_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP附件关联（字段引用 file_id）';
