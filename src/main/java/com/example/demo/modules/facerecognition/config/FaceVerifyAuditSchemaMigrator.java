package com.example.demo.modules.facerecognition.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 无 Flyway 时保证 {@code face_verify_audit} 表及抓拍/底库图列存在。
 * IDEA 开发环境与 JAR 共用同一库时，仅补缺失列，重复启动不报错。
 */
@Component
@Order(3)
public class FaceVerifyAuditSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(FaceVerifyAuditSchemaMigrator.class);

    private final JdbcTemplate jdbcTemplate;

    public FaceVerifyAuditSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS face_verify_audit (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        user_id VARCHAR(128) NOT NULL COMMENT '人员ID',
                        session_id VARCHAR(128) COMMENT '验证会话ID',
                        matched TINYINT NOT NULL COMMENT '是否通过',
                        similarity DOUBLE COMMENT '最高相似度',
                        match_threshold DOUBLE COMMENT '通过阈值',
                        reject_threshold DOUBLE COMMENT '拒绝阈值',
                        model_version VARCHAR(64) COMMENT '模型版本',
                        challenge_action VARCHAR(32) COMMENT '活体动作',
                        source VARCHAR(32) COMMENT '来源 gate/personal/pip',
                        baseline_count INT COMMENT '底库张数',
                        best_baseline_id BIGINT COMMENT '最佳匹配底库ID',
                        probe_face_detected TINYINT COMMENT '抓拍是否检测到人脸',
                        probe_image_urls TEXT COMMENT '比对抓拍图 URL 列表 JSON',
                        best_baseline_image_url VARCHAR(512) COMMENT '最佳匹配底库图 URL',
                        top_sims_json VARCHAR(256) COMMENT 'Top 相似度 JSON 数组',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        KEY idx_user_id (user_id),
                        KEY idx_created_at (created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人脸验证审计'
                    """);
            ensureColumnExists(
                    "face_verify_audit",
                    "probe_image_urls",
                    "ALTER TABLE face_verify_audit ADD COLUMN probe_image_urls TEXT COMMENT '比对抓拍图 URL 列表 JSON'"
            );
            ensureColumnExists(
                    "face_verify_audit",
                    "best_baseline_image_url",
                    "ALTER TABLE face_verify_audit ADD COLUMN best_baseline_image_url VARCHAR(512) COMMENT '最佳匹配底库图 URL'"
            );
            ensureColumnExists(
                    "face_verify_audit",
                    "top_sims_json",
                    "ALTER TABLE face_verify_audit ADD COLUMN top_sims_json VARCHAR(256) COMMENT 'Top 相似度 JSON 数组'"
            );
            log.info("[face-verify-audit-schema] face_verify_audit 表结构已就绪");
        } catch (Exception e) {
            log.error("[face-verify-audit-schema] 表结构迁移失败: {}", e.getMessage(), e);
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
            log.info("[face-verify-audit-schema] 已补列 {}.{}", tableName, columnName);
        }
    }
}
