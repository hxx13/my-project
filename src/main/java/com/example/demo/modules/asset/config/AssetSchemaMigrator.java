package com.example.demo.modules.asset.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@Order(110)
public class AssetSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AssetSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public AssetSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        // === 关键列定义：优先执行，独立容错，确保基本列始终存在 ===
        safeRun("ensure-col-校区", () -> ensureAssetColumnDef("col_校区", "校区"));
        safeRun("ensure-col-管理部门", () -> ensureAssetColumnDef("col_管理部门", "管理部门"));

        // === 核心表结构 ===
        safeRun("ddl-asset", () -> {
            try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_record (
                        id VARCHAR(64) PRIMARY KEY,
                        asset_code VARCHAR(128) NOT NULL COMMENT '资产编码',
                        asset_name VARCHAR(255) NOT NULL COMMENT '资产名称',
                        status VARCHAR(64) DEFAULT 'NORMAL' COMMENT '资产状态',
                        location VARCHAR(255) COMMENT '当前位置',
                        locked TINYINT NOT NULL DEFAULT 0 COMMENT '是否锁定',
                        note VARCHAR(500) COMMENT '标注信息',
                        latest_transfer_request_id VARCHAR(64) COMMENT '最新转移申请ID',
                        create_by VARCHAR(50) COMMENT '创建人ID',
                        update_by VARCHAR(50) COMMENT '更新人ID',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_asset_record_code (asset_code),
                        KEY idx_asset_record_name (asset_name),
                        KEY idx_asset_record_status (status),
                        KEY idx_asset_record_locked (locked)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产主表'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_column_def (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        column_key VARCHAR(64) NOT NULL COMMENT '列键',
                        column_label VARCHAR(128) NOT NULL COMMENT '列名',
                        value_type VARCHAR(32) NOT NULL DEFAULT 'TEXT' COMMENT '值类型',
                        sortable TINYINT NOT NULL DEFAULT 1 COMMENT '是否可排序',
                        searchable TINYINT NOT NULL DEFAULT 1 COMMENT '是否可搜索',
                        sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
                        create_by VARCHAR(50) COMMENT '创建人ID',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_asset_column_key (column_key)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产动态列定义'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_record_value (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
                        column_key VARCHAR(64) NOT NULL COMMENT '列键',
                        column_value TEXT COMMENT '列值',
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_asset_value_asset_col (asset_id, column_key),
                        KEY idx_asset_value_col (column_key),
                        KEY idx_asset_value_asset (asset_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产动态列值'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_transfer_request (
                        id VARCHAR(64) PRIMARY KEY,
                        asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
                        asset_code VARCHAR(128) NOT NULL COMMENT '资产编码',
                        asset_name VARCHAR(255) NOT NULL COMMENT '资产名称',
                        applicant_id VARCHAR(50) NOT NULL COMMENT '申请人ID',
                        applicant_name VARCHAR(100) COMMENT '申请人名称',
                        transfer_time DATETIME NOT NULL COMMENT '申请转移时间',
                        transfer_location VARCHAR(255) NOT NULL COMMENT '申请转移地点',
                        remark VARCHAR(500) COMMENT '申请备注',
                        photo_url TEXT COMMENT '上传照片URL',
                        status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED' COMMENT '申请状态',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_asset_transfer_asset (asset_id),
                        INDEX idx_asset_transfer_applicant (applicant_id),
                        INDEX idx_asset_transfer_create_time (create_time)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产转移申请'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_transfer_log (
                        id VARCHAR(64) PRIMARY KEY,
                        request_id VARCHAR(64) NOT NULL COMMENT '申请ID',
                        asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
                        action_type VARCHAR(32) NOT NULL COMMENT '动作类型',
                        operator_id VARCHAR(50) COMMENT '操作人ID',
                        remark VARCHAR(500) COMMENT '备注',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_asset_transfer_log_request (request_id),
                        INDEX idx_asset_transfer_log_asset (asset_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产转移流程日志'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_transfer_export_file (
                        id VARCHAR(64) PRIMARY KEY,
                        request_id VARCHAR(64) NOT NULL COMMENT '转移申请ID',
                        file_name VARCHAR(255) NOT NULL COMMENT '导出文件名',
                        storage_key VARCHAR(500) NOT NULL COMMENT '文件存储键/URL',
                        download_token VARCHAR(128) NOT NULL COMMENT '下载令牌',
                        status VARCHAR(32) NOT NULL DEFAULT 'READY' COMMENT '状态:GENERATING/READY/FAILED/EXPIRED',
                        expire_at DATETIME NOT NULL COMMENT '过期时间',
                        summary_text VARCHAR(500) NULL COMMENT '摘要',
                        created_by VARCHAR(50) NULL COMMENT '创建人',
                        created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_asset_transfer_export_request (request_id),
                        INDEX idx_asset_transfer_export_expire (expire_at),
                        UNIQUE KEY uk_asset_transfer_export_token (download_token)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='转移记录PDF导出文件'
                    """);
            ensureColumnExists("asset_record", "deleted",
                    "ALTER TABLE asset_record ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否'");
            ensureColumnExists("asset_record", "deleted_time",
                    "ALTER TABLE asset_record ADD COLUMN deleted_time DATETIME NULL COMMENT '删除时间'");
            ensureColumnExists("asset_record", "deleted_by",
                    "ALTER TABLE asset_record ADD COLUMN deleted_by VARCHAR(50) NULL COMMENT '删除人ID'");
            ensureColumnExists("asset_record", "purge_after_time",
                    "ALTER TABLE asset_record ADD COLUMN purge_after_time DATETIME NULL COMMENT '计划彻底清理时间'");
            ensureColumnExists("asset_transfer_request", "photo_urls_before",
                    "ALTER TABLE asset_transfer_request ADD COLUMN photo_urls_before TEXT NULL COMMENT '转移前照片URL JSON数组'");
            ensureColumnExists("asset_transfer_request", "photo_urls_after",
                    "ALTER TABLE asset_transfer_request ADD COLUMN photo_urls_after TEXT NULL COMMENT '转移后照片URL JSON数组'");
            ensureColumnExists("asset_transfer_request", "from_location",
                    "ALTER TABLE asset_transfer_request ADD COLUMN from_location VARCHAR(255) NULL COMMENT '转移前资产所在地(用于管理员删除后回滚)'");
            ensureColumnExists("asset_record", "photo_urls",
                    "ALTER TABLE asset_record ADD COLUMN photo_urls TEXT NULL COMMENT '资产照片URL JSON数组(转移前参考照片)'");
            ensureColumnExists("asset_transfer_request", "from_user_name",
                    "ALTER TABLE asset_transfer_request ADD COLUMN from_user_name VARCHAR(100) NULL COMMENT '转移前使用人姓名(用于对比展示)'");

            // 1a. 资产导入批次表
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_import_batch (
                        id VARCHAR(64) PRIMARY KEY,
                        file_name VARCHAR(255) NOT NULL,
                        imported_by VARCHAR(64),
                        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        created_count INT DEFAULT 0,
                        updated_count INT DEFAULT 0,
                        skipped_count INT DEFAULT 0,
                        error_detail TEXT,
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产导入批次'
                    """);

            // 1b. created_by_batch_id 列 + 索引
            ensureColumnExists("asset_record", "created_by_batch_id",
                    "ALTER TABLE asset_record ADD COLUMN created_by_batch_id VARCHAR(64) DEFAULT NULL COMMENT '创建该资产的导入批次ID'");
            ensureIndexExists("asset_record", "idx_asset_record_batch",
                    "CREATE INDEX idx_asset_record_batch ON asset_record(created_by_batch_id)");

            log.info("[asset-schema] 资产相关表已就绪");
        } catch (Exception e) {
            log.error("[asset-schema] 表结构迁移失败: {}", e.getMessage());
        }
        });
        // 以下操作独立容错，一个失败不影响其他
        safeRun("cleanup-dup-col", this::ensureColumnDefCleanup);
        safeRun("fix-bad-label", () -> ensureColumnDefFixBadLabel("存放地点2411033", "存放地点"));
    }

    private void safeRun(String name, Runnable task) {
        try {
            task.run();
        } catch (Exception e) {
            log.warn("[asset-schema] 步骤 [{}] 失败(已跳过): {}", name, e.getMessage());
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

    private void ensureIndexExists(String tableName, String indexName, String createIndexSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND INDEX_NAME = ?
                """,
                Integer.class,
                tableName,
                indexName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(createIndexSql);
        }
    }

    /** 清理"当前存放地点"重复列定义：保留第一条，将第二条数据迁移到第一条后删除 */
    private void ensureColumnDefCleanup() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT column_key FROM asset_column_def WHERE column_label LIKE '%存放地点%' ORDER BY sort_order ASC, id ASC"
            );
            if (rows == null || rows.size() < 2) {
                return;
            }
            String keyKeep = String.valueOf(rows.get(0).get("column_key"));
            String keyDelete = String.valueOf(rows.get(1).get("column_key"));
            if (keyKeep.equals(keyDelete)) {
                return;
            }
            // 将 keyDelete 的数据迁移到 keyKeep（跳过已存在 keyKeep 值的资产）
            jdbcTemplate.update(
                    "INSERT INTO asset_record_value (asset_id, column_key, column_value) " +
                    "SELECT v.asset_id, ?, v.column_value FROM asset_record_value v " +
                    "WHERE v.column_key = ? " +
                    "AND NOT EXISTS (SELECT 1 FROM asset_record_value v2 WHERE v2.asset_id = v.asset_id AND v2.column_key = ?)",
                    keyKeep, keyDelete, keyKeep
            );
            jdbcTemplate.update("DELETE FROM asset_record_value WHERE column_key = ?", keyDelete);
            jdbcTemplate.update("DELETE FROM asset_column_def WHERE column_key = ?", keyDelete);
            log.info("[asset-schema] 已合并重复列定义: {} → {}, 删除 {}", keyDelete, keyKeep, keyDelete);
        } catch (Exception e) {
            log.warn("[asset-schema] 清理重复列定义失败(可忽略): {}", e.getMessage());
        }
    }

    /** 修复错误表头：将 badLabel 重命名为 correctLabel，若目标已存在则迁移数据后删除 */
    private void ensureColumnDefFixBadLabel(String badLabel, String correctLabel) {
        try {
            String badKey = "col_" + badLabel.trim().toLowerCase(java.util.Locale.ROOT)
                    .replaceAll("[^a-z0-9\\u4e00-\\u9fa5]+", "_")
                    .replaceAll("^_+|_+$", "");
            String goodKey = "col_" + correctLabel.trim().toLowerCase(java.util.Locale.ROOT)
                    .replaceAll("[^a-z0-9\\u4e00-\\u9fa5]+", "_")
                    .replaceAll("^_+|_+$", "");
            if (badKey.equals(goodKey)) return;

            // 查找错误列
            Integer badCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM asset_column_def WHERE column_key = ?", Integer.class, badKey);
            if (badCount == null || badCount == 0) return;

            // 检查正确列是否已存在
            Integer goodCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM asset_column_def WHERE column_key = ?", Integer.class, goodKey);

            if (goodCount != null && goodCount > 0) {
                // 目标已存在 → 迁移数据后删除错误列
                jdbcTemplate.update(
                        "INSERT INTO asset_record_value (asset_id, column_key, column_value) " +
                        "SELECT v.asset_id, ?, v.column_value FROM asset_record_value v " +
                        "WHERE v.column_key = ? " +
                        "AND NOT EXISTS (SELECT 1 FROM asset_record_value v2 WHERE v2.asset_id = v.asset_id AND v2.column_key = ?)",
                        goodKey, badKey, goodKey);
                jdbcTemplate.update("DELETE FROM asset_record_value WHERE column_key = ?", badKey);
                jdbcTemplate.update("DELETE FROM asset_column_def WHERE column_key = ?", badKey);
                log.info("[asset-schema] 已合并错误列 {} → {} 并删除 {}", badLabel, correctLabel, badKey);
            } else {
                // 目标不存在 → 直接重命名
                jdbcTemplate.update(
                        "UPDATE asset_column_def SET column_label = ?, column_key = ? WHERE column_key = ?",
                        correctLabel, goodKey, badKey);
                jdbcTemplate.update(
                        "UPDATE asset_record_value SET column_key = ? WHERE column_key = ?",
                        goodKey, badKey);
                log.info("[asset-schema] 已重命名错误列 {} → {}", badLabel, correctLabel);
            }
        } catch (Exception e) {
            log.warn("[asset-schema] 修复错误表头失败(可忽略): {}", e.getMessage());
        }
    }

    /** 确保「校区」动态列存在，供小程序手动标记与筛选 */
    private void ensureAssetColumnDef(String columnKey, String columnLabel) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM asset_column_def
                WHERE column_key = ?
                """,
                Integer.class,
                columnKey
        );
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                INSERT INTO asset_column_def(column_key, column_label, value_type, sortable, searchable, sort_order, create_by)
                VALUES (?, ?, 'TEXT', 1, 1, 999, 'system')
                """,
                columnKey,
                columnLabel
        );
    }
}

