-- 与仓库 scripts/admin_file_templates.ddl.sql 保持一致；由 EmbeddedTwinSystemCoreDdlBootstrap 在启动时执行。
-- 若修改此处，请同步 scripts/admin_file_templates.ddl.sql 与 src/main/resources/schema.sql

CREATE TABLE IF NOT EXISTS admin_file_template (
    id VARCHAR(36) PRIMARY KEY,
    original_name VARCHAR(512) NOT NULL,
    storage_key VARCHAR(512) NOT NULL COMMENT '相对上传根目录的存储路径',
    mime_type VARCHAR(128) NOT NULL DEFAULT '',
    size_bytes BIGINT NOT NULL,
    uploaded_by_user_id VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_admin_file_template_storage (storage_key),
    KEY idx_admin_file_template_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台「文件模板下载」元数据';
