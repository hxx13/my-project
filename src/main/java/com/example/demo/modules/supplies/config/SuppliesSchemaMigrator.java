package com.example.demo.modules.supplies.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(125)
public class SuppliesSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SuppliesSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public SuppliesSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureColumnExists("supply_item", "deleted",
                    "ALTER TABLE supply_item ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否'");
            ensureColumnExists("supply_item", "deleted_time",
                    "ALTER TABLE supply_item ADD COLUMN deleted_time DATETIME NULL COMMENT '删除时间'");
            ensureColumnExists("supply_item", "deleted_by",
                    "ALTER TABLE supply_item ADD COLUMN deleted_by VARCHAR(50) NULL COMMENT '删除人ID'");
            ensureColumnExists("supply_item", "purge_after_time",
                    "ALTER TABLE supply_item ADD COLUMN purge_after_time DATETIME NULL COMMENT '计划彻底清理时间'");
            ensureColumnExists("supply_item", "created_at",
                    "ALTER TABLE supply_item ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'");
            ensureColumnExists("supply_item", "updated_at",
                    "ALTER TABLE supply_item ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'");
            ensureColumnExists("supply_item", "last_inbound_at",
                    "ALTER TABLE supply_item ADD COLUMN last_inbound_at DATETIME NULL COMMENT '最近入库时间'");
            jdbcTemplate.execute("""
                    UPDATE supply_item
                    SET created_at = COALESCE(created_at, last_inbound_at, NOW()),
                        updated_at = COALESCE(updated_at, NOW())
                    WHERE created_at IS NULL OR updated_at IS NULL
                    """);
            ensureColumnExists("supply_claim_order", "deleted",
                    "ALTER TABLE supply_claim_order ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否'");
            ensureColumnExists("supply_claim_order", "deleted_time",
                    "ALTER TABLE supply_claim_order ADD COLUMN deleted_time DATETIME NULL COMMENT '删除时间'");
            ensureColumnExists("supply_claim_order", "deleted_by",
                    "ALTER TABLE supply_claim_order ADD COLUMN deleted_by VARCHAR(50) NULL COMMENT '删除人ID'");
            ensureColumnExists("supply_claim_order", "purge_after_time",
                    "ALTER TABLE supply_claim_order ADD COLUMN purge_after_time DATETIME NULL COMMENT '计划彻底清理时间'");
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS supply_claim_export_file (
                        id VARCHAR(64) PRIMARY KEY,
                        claim_id VARCHAR(64) NOT NULL COMMENT '领用单ID',
                        file_name VARCHAR(255) NOT NULL COMMENT '导出文件名',
                        storage_key VARCHAR(500) NOT NULL COMMENT '文件存储键/URL',
                        download_token VARCHAR(128) NOT NULL COMMENT '下载令牌',
                        status VARCHAR(32) NOT NULL DEFAULT 'READY' COMMENT '状态:GENERATING/READY/FAILED/EXPIRED',
                        expire_at DATETIME NOT NULL COMMENT '过期时间',
                        summary_text VARCHAR(500) NULL COMMENT '摘要',
                        created_by VARCHAR(50) NULL COMMENT '创建人',
                        created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_supply_claim_export_claim (claim_id),
                        INDEX idx_supply_claim_export_expire (expire_at),
                        UNIQUE KEY uk_supply_claim_export_token (download_token)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用记录PDF导出文件'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS supply_user_view_state (
                        user_id VARCHAR(64) PRIMARY KEY,
                        last_viewed_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资页面用户查看状态'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS supply_inventory_movement (
                        id BIGINT PRIMARY KEY AUTO_INCREMENT,
                        item_id BIGINT NOT NULL COMMENT '物资ID',
                        movement_type VARCHAR(32) NOT NULL COMMENT 'INBOUND|OUTBOUND|ADJUST',
                        qty INT NOT NULL COMMENT '变动数量',
                        stock_after INT NULL COMMENT '变动后库存快照',
                        claim_id VARCHAR(64) NULL COMMENT '关联领用单',
                        claim_line_id BIGINT NULL COMMENT '关联领用明细行',
                        operator_user_id VARCHAR(64) NULL COMMENT '处理人',
                        applicant_user_id VARCHAR(64) NULL COMMENT '申请领用人',
                        remark VARCHAR(500) NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        KEY idx_sim_item_time (item_id, created_at),
                        KEY idx_sim_claim (claim_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资库存出入库流水'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS supply_user_cart (
                        user_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'sys_user.id',
                        lines_json MEDIUMTEXT NOT NULL COMMENT 'JSON：物资 itemId 字符串 -> 数量',
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用物资购物车（Web/小程序多端同步）'
                    """);
            log.info("[supplies-schema] 物资表结构已就绪");
        } catch (Exception e) {
            log.error("[supplies-schema] 表结构迁移失败: {}", e.getMessage());
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

