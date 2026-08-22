-- ============================================================
-- NHP 字段属性 vs 填写方式配合（V20260821041）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821041__nhp_template_field_datatype.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_template_field' AND COLUMN_NAME = 'data_type'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_template_field ADD COLUMN data_type VARCHAR(32) NULL COMMENT ''字段存储类型（快照，约束控件 type）'' AFTER field_key',
  'SELECT ''crf_template_field.data_type exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
