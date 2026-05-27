-- 门禁审计一级库：筛选配置（与门禁记录库筛选维度一致）
-- 目标库 twin_system，可与 access_fusion.ddl.sql 一并执行

CREATE TABLE IF NOT EXISTS access_audit_source_config (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL COMMENT '配置名称',
    enabled TINYINT NOT NULL DEFAULT 1,
    swing_task_id BIGINT NULL COMMENT '关联拉取任务，空=全部任务',
    channel_code VARCHAR(128) NULL,
    person_code VARCHAR(64) NULL COMMENT 'ARO userId / 人员编号',
    person_name VARCHAR(128) NULL,
    open_type INT NULL COMMENT '开门类型 48/49/51/52',
    require_mapping TINYINT NOT NULL DEFAULT 0 COMMENT '仅已映射人员',
    open_success_only TINYINT NOT NULL DEFAULT 1 COMMENT '仅开门成功',
    auto_sync_enabled TINYINT NOT NULL DEFAULT 0 COMMENT '拉取任务完成后自动同步（预留）',
    last_sync_at DATETIME NULL,
    last_sync_count INT NOT NULL DEFAULT 0,
    last_preview_swing_count INT NOT NULL DEFAULT 0,
    last_preview_raw_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_access_audit_source_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计一级库筛选配置';
