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
            ensureColumnExists("supply_claim_line", "remark",
                    "ALTER TABLE supply_claim_line ADD COLUMN remark VARCHAR(500) NULL COMMENT '出库备注'");
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
            ensureColumnExists("supply_item", "spec_schema",
                    "ALTER TABLE supply_item ADD COLUMN spec_schema JSON NULL COMMENT '规格定义'");
            ensureColumnExists("supply_item", "spec_required",
                    "ALTER TABLE supply_item ADD COLUMN spec_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否强制选规格'");
            ensureColumnExists("supply_claim_line", "spec_snapshot",
                    "ALTER TABLE supply_claim_line ADD COLUMN spec_snapshot VARCHAR(500) NULL COMMENT '规格快照'");
            ensureColumnExists("supply_item", "independent_order",
                    "ALTER TABLE supply_item ADD COLUMN independent_order TINYINT NOT NULL DEFAULT 0 COMMENT '是否独立成单:1是,0否'");
            ensureColumnExists("supply_category", "cover_url",
                    "ALTER TABLE supply_category ADD COLUMN cover_url VARCHAR(500) NULL COMMENT '分类封面图URL'");
            boolean lockedQtyCreated = ensureColumnExists("supply_item", "locked_qty",
                    "ALTER TABLE supply_item ADD COLUMN locked_qty INT NOT NULL DEFAULT 0 COMMENT '待处理领用锁定数量'");
            // 权威回填/校准：未删除 PENDING 领用行 SUM → locked_qty。
            // 列首次创建时必须跑；之后每次启动也跑一遍，修复硬删/历史 release 遗漏造成的幽灵锁定。
            String reconcileSql = """
                    UPDATE supply_item si SET locked_qty = COALESCE((
                        SELECT SUM(l.qty) FROM supply_claim_line l
                        JOIN supply_claim_order o ON l.order_id = o.id
                        WHERE l.item_id = si.id AND o.status = 'PENDING' AND (o.deleted IS NULL OR o.deleted = 0)
                    ), 0) WHERE si.stock_mode = 'QUANTIFIED' AND (si.deleted IS NULL OR si.deleted = 0)
                    """;
            try {
                jdbcTemplate.execute(reconcileSql);
                if (lockedQtyCreated) {
                    log.info("[supplies-schema] supply_item.locked_qty 已创建并回填 PENDING 锁定量");
                } else {
                    log.info("[supplies-schema] supply_item.locked_qty 已与 PENDING 领用行校准");
                }
            } catch (Exception e) {
                log.error("[supplies-schema] locked_qty 校准失败，请手工执行以下恢复 SQL：\n{}\n失败原因: {}",
                        reconcileSql, e.getMessage(), e);
            }
            log.info("[supplies-schema] 物资表结构已就绪");
        } catch (Exception e) {
            log.error("[supplies-schema] 表结构迁移失败: {}", e.getMessage());
        }
    }

    /** 列不存在则创建；返回是否本次新建（供一次性回填判断） */
    private boolean ensureColumnExists(String tableName, String columnName, String alterSql) {
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
            return true;
        }
        return false;
    }
}

