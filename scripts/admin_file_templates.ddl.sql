-- 后台「文件模板下载」：与 src/main/resources/schema.sql 中 admin_file_template 一致。
-- 目标库见 application.properties 的 spring.datasource.url；部署说明见 scripts/DEPLOY_DDL.md
-- 应用内置迁移：与 classpath db/bootstrap-admin-file-template.sql 须保持内容一致

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
