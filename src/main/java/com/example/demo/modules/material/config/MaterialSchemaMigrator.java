package com.example.demo.modules.material.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import com.example.demo.modules.material.service.MaterialService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(126)
public class MaterialSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(MaterialSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;
    private final MaterialService materialService;

    public MaterialSchemaMigrator(JdbcTemplate jdbcTemplate, MaterialService materialService) {
        this.jdbcTemplate = jdbcTemplate;
        this.materialService = materialService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_category (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(64) NOT NULL COMMENT '分类名称',
                    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
                    status TINYINT NOT NULL DEFAULT 1 COMMENT '0=禁用 1=启用',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资分类'
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_item (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    category_id BIGINT NOT NULL COMMENT '分类ID',
                    name VARCHAR(128) NOT NULL COMMENT '物品名称',
                    subtitle VARCHAR(256) NULL COMMENT '副标题',
                    cover_url VARCHAR(512) NULL COMMENT '封面图',
                    shelf_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
                    stock_mode VARCHAR(32) NOT NULL DEFAULT 'LIMITED' COMMENT 'LIMITED/UNLIMITED',
                    stock_qty INT NOT NULL DEFAULT 0 COMMENT '当前库存',
                    workflow_type VARCHAR(32) NOT NULL DEFAULT 'SIMPLE' COMMENT 'SIMPLE/DUAL_REVIEW',
                    reviewer_ids JSON NULL COMMENT '审核人账号ID列表',
                    second_reviewer_ids JSON NULL COMMENT '复审人账号ID列表',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否',
                    deleted_time DATETIME NULL COMMENT '删除时间',
                    deleted_by VARCHAR(50) NULL COMMENT '删除人ID',
                    purge_after_time DATETIME NULL COMMENT '计划彻底清理时间',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    last_inbound_at DATETIME NULL COMMENT '最近入库时间',
                    INDEX idx_mi_category (category_id),
                    INDEX idx_mi_shelf (shelf_status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资物品'
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_cart (
                    user_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '用户ID',
                    lines_json MEDIUMTEXT NOT NULL COMMENT 'JSON：物资 itemId -> 数量',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生物资购物车'
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_request (
                    id VARCHAR(32) PRIMARY KEY COMMENT '申领单业务ID',
                    user_id VARCHAR(64) NOT NULL COMMENT '申请人ID',
                    applicant_name VARCHAR(64) NULL COMMENT '申请人姓名',
                    applicant_group VARCHAR(128) NULL COMMENT '申请人所属课题组',
                    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PENDING/FIRST_OK/APPROVED/REJECTED/FULFILLED/RECEIVED',
                    workflow_type VARCHAR(32) NOT NULL DEFAULT 'SIMPLE' COMMENT 'SIMPLE/DUAL_REVIEW',
                    first_reviewer_id VARCHAR(64) NULL COMMENT '初审人ID',
                    first_review_time DATETIME NULL COMMENT '初审时间',
                    second_reviewer_id VARCHAR(64) NULL COMMENT '复审人ID',
                    second_review_time DATETIME NULL COMMENT '复审时间',
                    fulfilled_at DATETIME NULL COMMENT '出库时间',
                    fulfilled_by VARCHAR(64) NULL COMMENT '出库操作人',
                    received_at DATETIME NULL COMMENT '学生确认领取时间',
                    scheduled_pickup_time DATETIME NULL COMMENT '预约领取时间',
                    notification_sent TINYINT NOT NULL DEFAULT 0 COMMENT '预约通知是否已发送:0=未发,1=已发',
                    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删除',
                    deleted_time DATETIME NULL,
                    deleted_by VARCHAR(50) NULL,
                    purge_after_time DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_mr_user (user_id),
                    INDEX idx_mr_status (status),
                    INDEX idx_mr_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资申领单'
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_request_line (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    request_id VARCHAR(32) NOT NULL COMMENT '申领单ID',
                    item_id BIGINT NOT NULL COMMENT '物品ID',
                    qty INT NOT NULL DEFAULT 1 COMMENT '申领数量',
                    snapshot_name VARCHAR(128) NULL COMMENT '物品名称快照',
                    fulfilled_qty INT NOT NULL DEFAULT 0 COMMENT '实际出库数量',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_mrl_request (request_id),
                    INDEX idx_mrl_item (item_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申领明细行'
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_stock_movement (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    item_id BIGINT NOT NULL COMMENT '物品ID',
                    movement_type VARCHAR(32) NOT NULL COMMENT 'INBOUND|OUTBOUND|ADJUST',
                    qty INT NOT NULL COMMENT '变动数量',
                    stock_after INT NULL COMMENT '变动后库存快照',
                    request_id VARCHAR(32) NULL COMMENT '关联申领单',
                    request_line_id BIGINT NULL COMMENT '关联申领行',
                    operator_user_id VARCHAR(64) NULL COMMENT '操作人',
                    applicant_user_id VARCHAR(64) NULL COMMENT '申领人',
                    remark VARCHAR(500) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_msm_item_time (item_id, created_at),
                    INDEX idx_msm_request (request_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资库存流水'
                """);

            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_operation_log (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    target_type VARCHAR(32) NOT NULL COMMENT 'ITEM/REQUEST/CATEGORY',
                    target_id VARCHAR(64) NOT NULL COMMENT '目标ID',
                    action VARCHAR(32) NOT NULL COMMENT '操作动作',
                    operator_user_id VARCHAR(64) NULL COMMENT '操作人ID',
                    detail TEXT NULL COMMENT '操作详情JSON',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_mol_target (target_type, target_id),
                    INDEX idx_mol_created (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资操作日志'
                """);

            // 学生需求建议表
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS material_demand (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    user_id VARCHAR(64) NOT NULL COMMENT '学生ID',
                    suggestion TEXT NOT NULL COMMENT '需求建议内容',
                    status TINYINT NOT NULL DEFAULT 0 COMMENT '0=未处理 1=已处理',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_md_user (user_id),
                    INDEX idx_md_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生物资需求建议'
                """);

            // 需求建议入口可见性开关（sys_system_config）
            jdbcTemplate.update("""
                INSERT IGNORE INTO sys_system_config_def (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
                VALUES ('material', 'material.demand_entry_visible', '学生端显示需求建议入口', '控制学生端物资商城是否显示「需求建议」提交入口', 'BOOLEAN', '[{"label":"显示","value":"true"},{"label":"隐藏","value":"false"}]', 'true', 0, 0, 1, NOW())
                """);
            jdbcTemplate.update("""
                INSERT IGNORE INTO sys_system_config (module, config_key, config_value, value_type, remark, update_time)
                VALUES ('material', 'material.demand_entry_visible', 'true', 'BOOLEAN', '学生端需求建议入口开关', NOW())
                """);

            // locked_qty 预占库存字段
            ensureColumnExists("material_item", "locked_qty",
                    "ALTER TABLE material_item ADD COLUMN locked_qty INT NOT NULL DEFAULT 0 COMMENT '已锁定（申领中预占）数量'");
            // show_stock_qty 学生视角库存展示控制
            ensureColumnExists("material_item", "show_stock_qty",
                    "ALTER TABLE material_item ADD COLUMN show_stock_qty TINYINT NOT NULL DEFAULT 1 COMMENT '学生视角是否显示具体库存：1=显示数字 0=显示有货'");

            // spec_schema 规格定义
            ensureColumnExists("material_item", "spec_schema",
                    "ALTER TABLE material_item ADD COLUMN spec_schema JSON NULL COMMENT '规格定义'");
            // spec_required 是否强制选规格
            ensureColumnExists("material_item", "spec_required",
                    "ALTER TABLE material_item ADD COLUMN spec_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否强制选规格'");
            // spec_snapshot 申领行规格快照
            ensureColumnExists("material_request_line", "spec_snapshot",
                    "ALTER TABLE material_request_line ADD COLUMN spec_snapshot VARCHAR(500) NULL COMMENT '规格快照'");
            // independent_order 独立成单
            ensureColumnExists("material_item", "independent_order",
                    "ALTER TABLE material_item ADD COLUMN independent_order TINYINT NOT NULL DEFAULT 0 COMMENT '是否独立成单:1是,0否'");
            // notify_advance_hours 预约提前通知小时数
            ensureColumnExists("material_item", "notify_advance_hours",
                    "ALTER TABLE material_item ADD COLUMN notify_advance_hours INT NOT NULL DEFAULT 0 COMMENT '预约提前通知小时数:0=立即通知'");
            // scheduled_pickup_time 预约领取时间
            ensureColumnExists("material_request", "scheduled_pickup_time",
                    "ALTER TABLE material_request ADD COLUMN scheduled_pickup_time DATETIME NULL COMMENT '预约领取时间'");
            // notification_sent 预约通知是否已发
            ensureColumnExists("material_request", "notification_sent",
                    "ALTER TABLE material_request ADD COLUMN notification_sent TINYINT NOT NULL DEFAULT 0 COMMENT '预约通知是否已发送:0=未发,1=已发'");

            int backfilled = materialService.backfillRequestApplicantMetadata();
            if (backfilled > 0) {
                log.info("[material-schema] 已回填 {} 条申领单的申领人/课题组元数据", backfilled);
            }

            log.info("[material-schema] 物资申领表结构已就绪");
        } catch (Exception e) {
            log.error("[material-schema] 表结构迁移失败: {}", e.getMessage());
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
                """,
                Integer.class,
                tableName,
                columnName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(alterSql);
        }
    }
}
