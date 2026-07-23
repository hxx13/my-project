-- 页面帮助版本历史表；由 AdminPageHelpSchemaMigrator 启动时也会 CREATE IF NOT EXISTS。
-- 目标库（默认 twin_system）可独立执行本脚本。

CREATE TABLE IF NOT EXISTS admin_page_help_version (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    page_path VARCHAR(512) NOT NULL,
    version_label VARCHAR(32) NOT NULL COMMENT '如 V1.0.0',
    version_kind VARCHAR(16) NOT NULL DEFAULT 'update' COMMENT 'update=更新内容, new=新内容',
    body_html MEDIUMTEXT NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_page_help_version (page_path, version_label),
    KEY idx_page_help_version_path (page_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面帮助版本历史';
