package com.example.demo.modules.dahua.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 老库升级：保证 {@code dahua_device_channel_remark_category} 与
 * {@code dahua_device_channel_cache.remark_category_id} 存在，避免 Mapper 查询 500。
 */
@Component
@Order(100)
public class DahuaChannelRemarkSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DahuaChannelRemarkSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public DahuaChannelRemarkSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS dahua_device_channel_remark_category (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '备注分类ID',
                        name VARCHAR(128) NOT NULL COMMENT '分类名称（用于通道备注下拉）',
                        sort_order INT NOT NULL DEFAULT 0 COMMENT '排序，越小越靠前',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_dcc_remark_cat_name (name)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通道编码备注分类（可配置）'
                    """);

            Integer tableExists = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(*) FROM information_schema.TABLES
                            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dahua_device_channel_cache'
                            """,
                    Integer.class);
            if (tableExists == null || tableExists == 0) {
                log.warn("[dahua-schema] 无表 dahua_device_channel_cache，跳过 remark 列迁移");
                return;
            }

            Integer colCount = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(*) FROM information_schema.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'dahua_device_channel_cache'
                              AND COLUMN_NAME = 'remark_category_id'
                            """,
                    Integer.class);
            if (colCount != null && colCount == 0) {
                jdbcTemplate.execute("""
                        ALTER TABLE dahua_device_channel_cache
                        ADD COLUMN remark_category_id BIGINT NULL
                            COMMENT '本地备注分类（标签/二次封装）'
                        AFTER device_type
                        """);
                log.info("[dahua-schema] 已添加列 dahua_device_channel_cache.remark_category_id");
            }

            Integer idxCount = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(*) FROM information_schema.STATISTICS
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'dahua_device_channel_cache'
                              AND INDEX_NAME = 'idx_dcc_remark_cat'
                            """,
                    Integer.class);
            if (idxCount != null && idxCount == 0) {
                jdbcTemplate.execute("""
                        CREATE INDEX idx_dcc_remark_cat ON dahua_device_channel_cache (remark_category_id)
                        """);
                log.info("[dahua-schema] 已创建索引 idx_dcc_remark_cat");
            }

            Integer fkCount = jdbcTemplate.queryForObject(
                    """
                            SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                            WHERE CONSTRAINT_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'dahua_device_channel_cache'
                              AND CONSTRAINT_NAME = 'fk_dcc_remark_cat'
                              AND CONSTRAINT_TYPE = 'FOREIGN KEY'
                            """,
                    Integer.class);
            if (fkCount != null && fkCount == 0) {
                jdbcTemplate.execute("""
                        ALTER TABLE dahua_device_channel_cache
                        ADD CONSTRAINT fk_dcc_remark_cat
                        FOREIGN KEY (remark_category_id) REFERENCES dahua_device_channel_remark_category (id) ON DELETE SET NULL
                        """);
                log.info("[dahua-schema] 已添加外键 fk_dcc_remark_cat");
            }
        } catch (Exception e) {
            log.error("[dahua-schema] 通道备注相关表结构迁移失败，请检查数据库权限或手动执行 scripts/migrate_dahua_channel_remark.sql: {}",
                    e.getMessage());
        }
    }
}
