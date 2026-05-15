package com.example.demo.modules.asset.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

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
            log.info("[asset-schema] 资产相关表已就绪");
        } catch (Exception e) {
            log.error("[asset-schema] 表结构迁移失败: {}", e.getMessage());
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

