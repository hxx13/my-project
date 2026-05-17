package com.example.demo.modules.twin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;

@Component
@Order(126)
public class TwinCardMappingSchemaMigrator {
    private static final Logger log = LoggerFactory.getLogger(TwinCardMappingSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public TwinCardMappingSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostConstruct
    public void migrate() {
        try {
            ensureColumnExists(
                    "twin_card_mapping",
                    "dahua_person_code",
                    "ALTER TABLE twin_card_mapping ADD COLUMN dahua_person_code VARCHAR(64) NULL COMMENT '大华人员编码(用于权限下发/回收)'"
            );
            ensureColumnExists(
                    "twin_card_mapping",
                    "freeze_exempt_expire_at",
                    "ALTER TABLE twin_card_mapping ADD COLUMN freeze_exempt_expire_at DATETIME NULL COMMENT '豁免到期时间；到期自动收回'"
            );
            log.info("[twin-mapping-schema] twin_card_mapping 结构已就绪");
        } catch (Exception e) {
            log.error("[twin-mapping-schema] 结构迁移失败: {}", e.getMessage());
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

