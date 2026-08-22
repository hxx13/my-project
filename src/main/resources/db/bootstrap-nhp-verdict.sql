-- ============================================================
-- NHP verdict 校对维度（22 §6.5① / V20260821036）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821036__nhp_verdict.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND COLUMN_NAME = 'verdict'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_field ADD COLUMN verdict VARCHAR(16) NULL COMMENT ''校对四态 CONFIRM/MODIFY/DELETE/QUESTION'' AFTER concept_code',
  'SELECT ''crf_field.verdict exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND COLUMN_NAME = 'verdict_note'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_field ADD COLUMN verdict_note TEXT NULL COMMENT ''PI 校对意见'' AFTER verdict',
  'SELECT ''crf_field.verdict_note exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND COLUMN_NAME = 'review_round'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_field ADD COLUMN review_round INT NOT NULL DEFAULT 1 COMMENT ''校对轮次（第二轮商议 +1）'' AFTER verdict_note',
  'SELECT ''crf_field.review_round exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_codelist_item' AND COLUMN_NAME = 'verdict'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_codelist_item ADD COLUMN verdict VARCHAR(16) NULL COMMENT ''校对四态 CONFIRM/MODIFY/DELETE/QUESTION'' AFTER sort_order',
  'SELECT ''crf_codelist_item.verdict exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_codelist_item' AND COLUMN_NAME = 'verdict_note'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_codelist_item ADD COLUMN verdict_note TEXT NULL COMMENT ''码表项校对意见'' AFTER verdict',
  'SELECT ''crf_codelist_item.verdict_note exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
