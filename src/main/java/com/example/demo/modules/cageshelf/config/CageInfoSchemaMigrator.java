package com.example.demo.modules.cageshelf.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 笼位认领表单实例 EAV 值表迁移 — 仅建 cage_claim_info_value 表。
 *
 * <p>字段字典已迁到 NHP crf_field 体系（cage 数据域套，由 {@link CageNhpFieldSeed} 灌种），
 * 故此处不再建/播 cage_info_field 表（存量表不在此 drop，数据迁移另立任务）。
 * 排在 {@link CageShelfSchemaMigrator}（@Order(130)）之后执行。
 */
@Component
@Order(132)
public class CageInfoSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageInfoSchemaMigrator.class);
    private static final String CLAIM_VALUE_TABLE = "cage_claim_info_value";

    private final JdbcTemplate jdbcTemplate;

    public CageInfoSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            createClaimValueTableIfNeeded();
        } catch (Exception e) {
            log.error("[cage-info-schema] 迁移失败: {}", e.getMessage(), e);
        }
    }

    private void createClaimValueTableIfNeeded() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_claim_info_value (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    claim_id BIGINT NOT NULL COMMENT '认领ID → cage_claims.id',
                    field_id BIGINT NOT NULL COMMENT '字段ID → crf_field.id',
                    value_string VARCHAR(512) NULL,
                    value_text TEXT NULL,
                    value_int BIGINT NULL,
                    value_decimal DECIMAL(18,4) NULL,
                    value_date VARCHAR(32) NULL,
                    value_datetime VARCHAR(32) NULL,
                    value_bool TINYINT(1) NULL,
                    value_json JSON NULL,
                    fill_source VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_claim_field (claim_id, field_id),
                    KEY idx_cage_claim_info_value_claim (claim_id),
                    KEY idx_cage_claim_info_value_field (field_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='认领表单实例 EAV 值表'
                """);
        log.info("[cage-info-schema] {} 表已就绪", CLAIM_VALUE_TABLE);
    }
}
