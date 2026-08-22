-- ============================================================
-- NHP 模板字段 role / role_meta（V20260822002）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260822002__nhp_template_field_role.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_template_field' AND COLUMN_NAME = 'role'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_template_field ADD COLUMN role VARCHAR(16) NULL COMMENT ''PK/FK/VALUE/DERIVED（缺省 VALUE）'' AFTER dict_key',
  'SELECT ''crf_template_field.role exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_template_field' AND COLUMN_NAME = 'role_meta'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_template_field ADD COLUMN role_meta TEXT NULL COMMENT ''role 专属元数据 JSON：pkRule/entityType/derivedSource'' AFTER role',
  'SELECT ''crf_template_field.role_meta exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
