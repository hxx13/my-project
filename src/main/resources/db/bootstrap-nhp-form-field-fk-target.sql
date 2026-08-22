-- ============================================================
-- NHP FK 字段指向落库（V20260821042）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821042__nhp_form_field_fk_target.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form_field' AND COLUMN_NAME = 'fk_target'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_form_field ADD COLUMN fk_target VARCHAR(64) NULL COMMENT ''FK 字段指向实体'' AFTER role',
  'SELECT ''crf_form_field.fk_target exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
