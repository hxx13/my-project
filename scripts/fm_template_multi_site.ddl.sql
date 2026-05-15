-- 巡查模板多机房（与 schema.sql / FacilityMaintenanceSchemaMigrator 一致）
-- 在目标库执行一次（默认库名见 application.properties 的 spring.datasource.url）

CREATE TABLE IF NOT EXISTS fm_template_site (
    template_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (template_id, site_id),
    KEY idx_fm_tpl_site_sid (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板适用机房（多选；优先于 site_id 单字段）';

-- 将历史单机房 site_id 迁入关联表（可重复执行）
INSERT IGNORE INTO fm_template_site(template_id, site_id)
SELECT id, site_id FROM fm_checklist_template
WHERE site_id IS NOT NULL AND TRIM(site_id) <> '';
