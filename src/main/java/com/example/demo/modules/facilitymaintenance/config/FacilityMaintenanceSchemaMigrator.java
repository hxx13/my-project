package com.example.demo.modules.facilitymaintenance.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(115)
public class FacilityMaintenanceSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(FacilityMaintenanceSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public FacilityMaintenanceSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
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
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='机房/巡查地点'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_option_set (
                        id VARCHAR(64) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下拉选项集'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_option_item (
                        id VARCHAR(64) PRIMARY KEY,
                        option_set_id VARCHAR(64) NOT NULL,
                        label VARCHAR(255) NOT NULL,
                        sort_order INT NOT NULL DEFAULT 0,
                        KEY idx_fm_opt_item_set (option_set_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下拉选项项'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_checklist_template (
                        id VARCHAR(64) PRIMARY KEY,
                        site_id VARCHAR(64) NULL COMMENT 'NULL=全局模板',
                        name VARCHAR(255) NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        KEY idx_fm_tpl_site (site_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_template_site (
                        template_id VARCHAR(64) NOT NULL,
                        site_id VARCHAR(64) NOT NULL,
                        PRIMARY KEY (template_id, site_id),
                        KEY idx_fm_tpl_site_sid (site_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板适用机房（多选）'
                    """);
            try {
                jdbcTemplate.update("""
                        INSERT IGNORE INTO fm_template_site(template_id, site_id)
                        SELECT id, site_id FROM fm_checklist_template
                        WHERE site_id IS NOT NULL AND TRIM(site_id) <> ''
                        """);
            } catch (Exception ignored) {
            }
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_template_item (
                        id VARCHAR(64) PRIMARY KEY,
                        template_id VARCHAR(64) NOT NULL,
                        label VARCHAR(255) NOT NULL,
                        field_type VARCHAR(32) NOT NULL COMMENT 'TEXT,NUMBER,BOOLEAN,SELECT,DATETIME',
                        option_set_id VARCHAR(64) NULL,
                        required_flag TINYINT NOT NULL DEFAULT 0,
                        sort_order INT NOT NULL DEFAULT 0,
                        KEY idx_fm_titem_tpl (template_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板项'
                    """);
            jdbcTemplate.execute("""
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
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查记录'
                    """);
            jdbcTemplate.execute("""
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
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材登记'
                    """);
            jdbcTemplate.execute("""
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
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='更换记录(过滤器等)'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_daily_inspection_sheet (
                        id VARCHAR(64) PRIMARY KEY,
                        sheet_date DATE NOT NULL COMMENT '业务日一张表',
                        template_id VARCHAR(64) NOT NULL,
                        status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|SUBMITTED',
                        grid_json LONGTEXT NOT NULL COMMENT '{"cells":{"siteId|itemId":"value"}}',
                        version INT NOT NULL DEFAULT 0,
                        submitted_at DATETIME NULL,
                        submitted_by_user_id VARCHAR(64) NULL,
                        submitted_by_name VARCHAR(128) NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_fm_daily_sheet_date (sheet_date)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='按日协作巡查表'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_consumable_catalog (
                        id VARCHAR(64) PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        unit VARCHAR(32) NULL,
                        sort_order INT NOT NULL DEFAULT 0,
                        disabled TINYINT NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材名目（快捷选择）'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS fm_replacement_filter_preset (
                        id VARCHAR(64) PRIMARY KEY,
                        label VARCHAR(64) NOT NULL,
                        sort_order INT NOT NULL DEFAULT 0,
                        disabled TINYINT NOT NULL DEFAULT 0
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='更换类型（下拉）'
                    """);
            try {
                jdbcTemplate.update("""
                        INSERT IGNORE INTO fm_replacement_filter_preset(id,label,sort_order,disabled)
                        VALUES ('FM_RP_01','初效',0,0),('FM_RP_02','中效',1,0),('FM_RP_03','高效',2,0)
                        """);
            } catch (Exception ignored) {
            }
            log.info("[facility-maintenance-schema] 表结构已就绪");
        } catch (Exception e) {
            log.error("[facility-maintenance-schema] 迁移失败: {}", e.getMessage());
        }
    }
}
