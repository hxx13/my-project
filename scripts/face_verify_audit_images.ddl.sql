-- 人脸验证审计：为已有表补抓拍/底库图 URL 列（幂等，目标库 twin_system）
-- 若已执行 scripts/face_verify_audit.ddl.sql 全量建表且含下列字段，本脚本各步将自动跳过

SET @db := DATABASE();

SET @exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'face_verify_audit' AND COLUMN_NAME = 'probe_image_urls'
);
SET @ddl := IF(@exists = 0,
    'ALTER TABLE face_verify_audit ADD COLUMN probe_image_urls TEXT COMMENT ''比对抓拍图 URL 列表 JSON''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'face_verify_audit' AND COLUMN_NAME = 'best_baseline_image_url'
);
SET @ddl := IF(@exists = 0,
    'ALTER TABLE face_verify_audit ADD COLUMN best_baseline_image_url VARCHAR(512) COMMENT ''最佳匹配底库图 URL''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'face_verify_audit' AND COLUMN_NAME = 'top_sims_json'
);
SET @ddl := IF(@exists = 0,
    'ALTER TABLE face_verify_audit ADD COLUMN top_sims_json VARCHAR(256) COMMENT ''Top 相似度 JSON 数组''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
