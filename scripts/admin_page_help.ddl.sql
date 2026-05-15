-- 后台「页面帮助」正文与留言（与 schema.sql 一致；目标库执行一次即可）
CREATE TABLE IF NOT EXISTS admin_page_help (
    page_path VARCHAR(512) NOT NULL PRIMARY KEY COMMENT 'Web 路由，如 /admin/supplies',
    body_html MEDIUMTEXT NULL COMMENT '富文本 HTML',
    updated_by VARCHAR(64) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台页面帮助正文';

CREATE TABLE IF NOT EXISTS admin_page_help_message (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    page_path VARCHAR(512) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_admin_page_help_message_path (page_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台页面帮助留言';
