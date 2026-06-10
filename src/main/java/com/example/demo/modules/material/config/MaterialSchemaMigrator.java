package com.example.demo.modules.material.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(126)
public class MaterialSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(MaterialSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public MaterialSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
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

            log.info("[material-schema] 物资申领表结构已就绪");
        } catch (Exception e) {
            log.error("[material-schema] 表结构迁移失败: {}", e.getMessage());
        }
    }
}
