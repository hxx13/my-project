package com.example.demo.modules.referencedata.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(130)
public class ReferenceDataSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ReferenceDataSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public ReferenceDataSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureTableExists("ref_data", """
                    CREATE TABLE ref_data (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        ref_type VARCHAR(50) NOT NULL COMMENT 'SUPPLIER/ANIMAL_BREED/ANIMAL_STRAIN/SPEC',
                        parent_id BIGINT NULL,
                        sort_order INT NOT NULL DEFAULT 0,
                        status TINYINT NOT NULL DEFAULT 1 COMMENT '1=normal 0=disabled',
                        field_data JSON COMMENT 'type-specific fields + purchasable + specTemplateIds + customSpecs',
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE INDEX uq_ref_type_parent_sort (ref_type, parent_id, sort_order),
                        INDEX idx_ref_type_status (ref_type, status),
                        INDEX idx_parent_id (parent_id),
                        CONSTRAINT fk_ref_parent FOREIGN KEY (parent_id) REFERENCES ref_data(id) ON DELETE SET NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);

            ensureTableExists("ref_spec_template", """
                    CREATE TABLE ref_spec_template (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        scope VARCHAR(20) NOT NULL DEFAULT 'ALL' COMMENT 'ALL / BREED_TYPE',
                        breed_type VARCHAR(50) NULL,
                        options JSON NOT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);

            ensureTableExists("ref_cart", """
                    CREATE TABLE ref_cart (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        group_id VARCHAR(100) NOT NULL,
                        ref_data_id BIGINT NOT NULL,
                        aup_record_id BIGINT NULL COMMENT '加购锁定的 AUP → aup_record.id',
                        spec_selections JSON COMMENT '{"age":"6W","gender":"male"}',
                        quantity INT NOT NULL DEFAULT 1,
                        remark VARCHAR(500) NULL,
                        package_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|READY',
                        package_remark VARCHAR(500) NULL COMMENT '实验员订单包统一备注',
                        added_by VARCHAR(100) NOT NULL,
                        added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_cart_group (group_id),
                        INDEX idx_cart_aup (aup_record_id),
                        INDEX idx_cart_package (group_id, package_status),
                        CONSTRAINT fk_cart_ref FOREIGN KEY (ref_data_id) REFERENCES ref_data(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);

            ensureColumnExists("ref_cart", "aup_record_id",
                    "ALTER TABLE ref_cart ADD COLUMN aup_record_id BIGINT NULL COMMENT '加购锁定的 AUP → aup_record.id' AFTER ref_data_id");
            ensureColumnExists("ref_cart", "package_status",
                    "ALTER TABLE ref_cart ADD COLUMN package_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|READY' AFTER remark");
            ensureColumnExists("ref_cart", "package_remark",
                    "ALTER TABLE ref_cart ADD COLUMN package_remark VARCHAR(500) NULL COMMENT '实验员订单包统一备注' AFTER package_status");
            ensureIndexExists("ref_cart", "idx_cart_aup",
                    "CREATE INDEX idx_cart_aup ON ref_cart (aup_record_id)");
            ensureIndexExists("ref_cart", "idx_cart_package",
                    "CREATE INDEX idx_cart_package ON ref_cart (group_id, package_status)");

            ensureTableExists("ref_order", """
                    CREATE TABLE ref_order (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        group_id VARCHAR(100) NOT NULL,
                        submitter_id VARCHAR(100) NOT NULL,
                        submitter_name VARCHAR(100) NULL,
                        project_group_name VARCHAR(200) NULL,
                        project_group_id BIGINT NULL COMMENT '课题组主键外键 → project_group.id（关键枢纽）',
                        aup_record_id BIGINT NULL COMMENT '下单选定的 AUP → aup_record.id',
                        register_no VARCHAR(64) NULL COMMENT 'AUP 编号冗余快照',
                        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED/COMPLETED/CANCELLED',
                        submit_remark VARCHAR(500) NULL,
                        submitted_at DATETIME NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_order_group (group_id),
                        INDEX idx_order_status (status),
                        INDEX idx_project_group (project_group_name),
                        INDEX idx_order_pg (project_group_id),
                        INDEX idx_order_aup (aup_record_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);

            ensureColumnExists("ref_order", "submitter_name",
                    "ALTER TABLE ref_order ADD COLUMN submitter_name VARCHAR(100) NULL AFTER submitter_id");
            ensureColumnExists("ref_order", "project_group_name",
                    "ALTER TABLE ref_order ADD COLUMN project_group_name VARCHAR(200) NULL AFTER submitter_name");
            ensureColumnExists("ref_order", "project_group_id",
                    "ALTER TABLE ref_order ADD COLUMN project_group_id BIGINT NULL COMMENT '课题组主键外键 → project_group.id' AFTER project_group_name");
            ensureColumnExists("ref_order", "aup_record_id",
                    "ALTER TABLE ref_order ADD COLUMN aup_record_id BIGINT NULL COMMENT '下单选定的 AUP → aup_record.id' AFTER project_group_id");
            ensureColumnExists("ref_order", "register_no",
                    "ALTER TABLE ref_order ADD COLUMN register_no VARCHAR(64) NULL COMMENT 'AUP 编号冗余快照' AFTER aup_record_id");
            ensureColumnExists("ref_order", "estimated_delivery_date",
                    "ALTER TABLE ref_order ADD COLUMN estimated_delivery_date DATE NULL COMMENT '下单时计算的预计送达日（工作日）' AFTER submitted_at");

            ensureTableExists("ref_order_line", """
                    CREATE TABLE ref_order_line (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        order_id BIGINT NOT NULL,
                        ref_data_id BIGINT NOT NULL,
                        spec_selections JSON,
                        hierarchy_chain JSON NULL COMMENT 'Full ancestor chain from leaf to root: [{id, refType, displayName}]',
                        quantity INT NOT NULL DEFAULT 1,
                        line_remark VARCHAR(500) NULL,
                        added_by VARCHAR(100) NULL COMMENT '加购人（个人归属，从 ref_cart.added_by 复制）',
                        aup_record_id BIGINT NULL COMMENT '行级 AUP 合规归因 → aup_record.id',
                        CONSTRAINT fk_line_order FOREIGN KEY (order_id) REFERENCES ref_order(id) ON DELETE CASCADE,
                        CONSTRAINT fk_line_ref FOREIGN KEY (ref_data_id) REFERENCES ref_data(id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);

            // Idempotent: add hierarchy_chain to existing ref_order_line tables
            ensureColumnExists("ref_order_line", "hierarchy_chain",
                    "ALTER TABLE ref_order_line ADD COLUMN hierarchy_chain JSON NULL COMMENT 'Full ancestor chain from leaf to root' AFTER spec_selections");
            ensureColumnExists("ref_order_line", "added_by",
                    "ALTER TABLE ref_order_line ADD COLUMN added_by VARCHAR(100) NULL COMMENT '加购人（个人归属）' AFTER line_remark");
            ensureColumnExists("ref_order_line", "aup_record_id",
                    "ALTER TABLE ref_order_line ADD COLUMN aup_record_id BIGINT NULL COMMENT '行级 AUP 合规归因 → aup_record.id' AFTER added_by");
            ensureIndexExists("ref_order_line", "idx_line_aup",
                    "CREATE INDEX idx_line_aup ON ref_order_line (aup_record_id)");

            // 旧订单：头有 AUP、行无值时回填（仅执行一次语义：幂等 SET 已有值不变）
            try {
                jdbcTemplate.update("""
                        UPDATE ref_order_line l
                        INNER JOIN ref_order o ON o.id = l.order_id
                        SET l.aup_record_id = o.aup_record_id
                        WHERE l.aup_record_id IS NULL
                          AND o.aup_record_id IS NOT NULL
                        """);
            } catch (Exception e) {
                log.warn("[reference-data-schema] backfill order line aup failed: {}", e.getMessage());
            }

            ensureTableExists("ref_order_log", """
                    CREATE TABLE ref_order_log (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        order_id BIGINT NOT NULL,
                        action VARCHAR(30) NOT NULL COMMENT 'CREATED/SUBMITTED/APPROVED/REJECTED/COMPLETED/CANCELLED',
                        operator_id VARCHAR(100) NOT NULL,
                        detail TEXT NULL,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_log_order FOREIGN KEY (order_id) REFERENCES ref_order(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                    """);

            log.info("[reference-data-schema] 参考数据管理表结构已就绪");
        } catch (Exception e) {
            log.error("[reference-data-schema] 表结构迁移失败: {}", e.getMessage());
        }
    }

    private void ensureTableExists(String tableName, String createSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                """,
                Integer.class,
                tableName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(createSql);
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
                tableName, columnName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("[reference-data-schema] Added column {}.{}", tableName, columnName);
        }
    }

    private void ensureIndexExists(String tableName, String indexName, String createSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND INDEX_NAME = ?
                """,
                Integer.class,
                tableName, indexName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(createSql);
            log.info("[reference-data-schema] Added index {}.{}", tableName, indexName);
        }
    }
}
