-- 扫码弹窗公告（富文本，多条翻页展示）
-- 目标库见 application.properties 的 spring.datasource.url（如 twin_system）

CREATE TABLE IF NOT EXISTS twin_scan_popup_announcement (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL COMMENT '公告标题',
    content_html MEDIUMTEXT NULL COMMENT '富文本正文（服务端 Jsoup 消毒）',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=参与扫码展示',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '越大越靠前',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE | ARCHIVED',
    publish_at DATETIME NULL COMMENT '最早展示时间；NULL=立即',
    expire_at DATETIME NULL COMMENT '过期时间；NULL=不过期',
    created_by_user_id VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tspa_status_enabled (status, enabled, sort_order),
    KEY idx_tspa_publish (publish_at, expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码弹窗公告（多条翻页）';
