-- ============================================================
-- NHP 原子优先种子重构（V20260821040）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821040__nhp_atom_priority.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND COLUMN_NAME = 'id_rule_type'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_field ADD COLUMN id_rule_type VARCHAR(16) NULL COMMENT ''PK 字段编码规则类型 DON/RCP/XM/TX/FU/AE/REG/MED/LVL/PATH/PERF/SMP/TST'' AFTER concept_code',
  'SELECT ''crf_field.id_rule_type exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND COLUMN_NAME = 'nature'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_field ADD COLUMN nature VARCHAR(16) NULL COMMENT ''字段性质 DATA/FK/PK/DERIVED'' AFTER id_rule_type',
  'SELECT ''crf_field.nature exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_form.code 加宽（VARCHAR(16) -> VARCHAR(64) 承载独立 snake_case 原子名）
SET @mod := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND COLUMN_NAME = 'code'
);
SET @sql = IF(@mod IS NOT NULL AND @mod < 64,
  'ALTER TABLE crf_form MODIFY COLUMN code VARCHAR(64) NOT NULL COMMENT ''表单编码（原子=独立 snake_case 如 donor_profile）''',
  'SELECT ''crf_form.code already >= 64''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
