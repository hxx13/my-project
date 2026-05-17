-- 统计审计 · 个人配置分享码（封箱快照，一次性导入克隆）
-- 目标库 twin_system；应用启动时 AnalyticsSchemaMigrator 也会 CREATE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS analytics_view_share (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    share_code_hash VARCHAR(64) NOT NULL COMMENT '分享码 SHA-256(pepper|code)',
    share_code_plain VARCHAR(16) NULL COMMENT '明文分享码（所有者可在后台查看）',
    owner_user_id VARCHAR(64) NOT NULL,
    source_view_id BIGINT NOT NULL,
    report_key VARCHAR(64) NOT NULL,
    snapshot_version INT NOT NULL DEFAULT 1,
    payload_json MEDIUMTEXT NOT NULL COMMENT '封箱：view+auditLogs+insights',
    audit_log_count INT NOT NULL DEFAULT 0,
    insight_count INT NOT NULL DEFAULT 0,
    owner_display_name VARCHAR(128) NOT NULL DEFAULT '' COMMENT '分享者展示名（预览用）',
    expires_at DATETIME NOT NULL,
    max_imports INT NOT NULL DEFAULT 10,
    import_count INT NOT NULL DEFAULT 0,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_avs_code_hash (share_code_hash),
    KEY idx_avs_owner (owner_user_id, created_at),
    KEY idx_avs_source_view (source_view_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统计审计-配置分享封箱';

-- 已有表升级（仅需执行一次）：
-- ALTER TABLE analytics_view_share ADD COLUMN share_code_plain VARCHAR(16) NULL COMMENT '明文分享码' AFTER share_code_hash;
