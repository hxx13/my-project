-- ============================================================
-- NHP 模板章节 code 加宽（V20260821044）
-- EmbeddedTwinSystemCoreDdlBootstrap idempotent.
-- Source: common/schema/V20260821044__nhp_template_section_code.sql
-- ============================================================

SET @db := DATABASE();

-- crf_template_section.code 加宽（VARCHAR(16) -> VARCHAR(64)，对齐 crf_form.code / 原子 snake_case）
SET @mod := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_template_section' AND COLUMN_NAME = 'code'
);
SET @sql = IF(@mod IS NOT NULL AND @mod < 64,
  'ALTER TABLE crf_template_section MODIFY COLUMN code VARCHAR(64) NOT NULL COMMENT ''段/小节标识（原子=snake_case 如 donor_profile；存量 D1/D1.01）''',
  'SELECT ''crf_template_section.code already >= 64''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- crf_composite_atom.atom_code 加宽（组合钉原子须存同一 snake_case 键）
SET @mod := (
  SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_composite_atom' AND COLUMN_NAME = 'atom_code'
);
SET @sql = IF(@mod IS NOT NULL AND @mod < 64,
  'ALTER TABLE crf_composite_atom MODIFY COLUMN atom_code VARCHAR(64) NOT NULL COMMENT ''原子模板编码（snake_case 或存量 D1）''',
  'SELECT ''crf_composite_atom.atom_code already >= 64''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
