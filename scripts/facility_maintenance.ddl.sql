-- 检查维护模块表结构（与 src/main/resources/schema.sql 中 fm_* 段一致）
-- 目标库见 application.properties 的 spring.datasource.url（如 twin_system）
-- 应用启动时 FacilityMaintenanceSchemaMigrator 也会 CREATE TABLE IF NOT EXISTS；若 migrator 失败可手动执行本脚本。

CREATE TABLE IF NOT EXISTS fm_site (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    disabled TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_fm_site_sort (sort_order),
    KEY idx_fm_site_disabled (disabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='机房/巡查地点';

CREATE TABLE IF NOT EXISTS fm_option_set (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下拉选项集';

CREATE TABLE IF NOT EXISTS fm_option_item (
    id VARCHAR(64) PRIMARY KEY,
    option_set_id VARCHAR(64) NOT NULL,
    label VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    KEY idx_fm_opt_item_set (option_set_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下拉选项项';

CREATE TABLE IF NOT EXISTS fm_checklist_template (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NULL COMMENT 'NULL=全局模板',
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_fm_tpl_site (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板';

CREATE TABLE IF NOT EXISTS fm_template_item (
    id VARCHAR(64) PRIMARY KEY,
    template_id VARCHAR(64) NOT NULL,
    label VARCHAR(255) NOT NULL,
    field_type VARCHAR(32) NOT NULL COMMENT 'TEXT,NUMBER,BOOLEAN,SELECT,DATETIME',
    option_set_id VARCHAR(64) NULL,
    required_flag TINYINT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    KEY idx_fm_titem_tpl (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板项';

CREATE TABLE IF NOT EXISTS fm_inspection_record (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(64) NULL,
    inspected_at DATETIME NOT NULL,
    operator_user_id VARCHAR(64) NULL,
    operator_name VARCHAR(128) NULL,
    values_json LONGTEXT NOT NULL COMMENT 'templateItemId->value',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_fm_insp_site (site_id),
    KEY idx_fm_insp_time (inspected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查记录';

CREATE TABLE IF NOT EXISTS fm_consumable_line (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    consumable_name VARCHAR(255) NOT NULL,
    qty DECIMAL(18,4) NOT NULL,
    unit VARCHAR(32) NULL,
    occurred_at DATETIME NOT NULL,
    note VARCHAR(500) NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_fm_cons_site (site_id),
    KEY idx_fm_cons_time (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材登记';

CREATE TABLE IF NOT EXISTS fm_replacement_record (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    filter_type VARCHAR(64) NOT NULL COMMENT '初效/中效/高效等',
    replaced_at DATETIME NOT NULL,
    note VARCHAR(500) NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_fm_rep_site (site_id),
    KEY idx_fm_rep_filter (site_id, filter_type),
    KEY idx_fm_rep_time (replaced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='更换记录(过滤器等)';
