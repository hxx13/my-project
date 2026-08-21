-- ============================================================
-- NHP 研究对象身份标识字段（对齐 数据库字段档案 D1.01/D2.01）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动幂等执行。
-- 同源：common/schema/V20260821013__nhp_subject_identity.sql
-- 说明：CREATE TABLE IF NOT EXISTS 不会给已有表加列，故单独 ALTER。
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'sex'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN sex VARCHAR(8) NULL COMMENT ''性别 M/F'' AFTER basic_json',
  'SELECT ''sex exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'birth_date'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN birth_date DATE NULL COMMENT ''出生日期'' AFTER sex',
  'SELECT ''birth_date exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'species'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN species VARCHAR(64) NULL COMMENT ''物种（受体：食蟹猴/恒河猴等）'' AFTER birth_date',
  'SELECT ''species exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'breed'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN breed VARCHAR(64) NULL COMMENT ''品种/品系（供体）'' AFTER species',
  'SELECT ''breed exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'weight_kg'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN weight_kg DECIMAL(10,3) NULL COMMENT ''体重 kg'' AFTER breed',
  'SELECT ''weight_kg exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'age_years'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN age_years DECIMAL(6,2) NULL COMMENT ''年龄（岁）'' AFTER weight_kg',
  'SELECT ''age_years exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'external_id'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN external_id VARCHAR(64) NULL COMMENT ''院内/基地原编号'' AFTER age_years',
  'SELECT ''external_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'microchip_id'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN microchip_id VARCHAR(64) NULL COMMENT ''芯片号'' AFTER external_id',
  'SELECT ''microchip_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'farm_code'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN farm_code VARCHAR(64) NULL COMMENT ''基地编码（供体 farm_id）'' AFTER microchip_id',
  'SELECT ''farm_code exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'origin_note'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN origin_note VARCHAR(256) NULL COMMENT ''来源与检疫摘要'' AFTER farm_code',
  'SELECT ''origin_note exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'biocontainment_level'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN biocontainment_level VARCHAR(16) NULL COMMENT ''SPF/DPF 等生物安全等级'' AFTER origin_note',
  'SELECT ''biocontainment_level exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND COLUMN_NAME = 'pedigree'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_subject ADD COLUMN pedigree VARCHAR(256) NULL COMMENT ''谱系（父/母 ID）'' AFTER biocontainment_level',
  'SELECT ''pedigree exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND INDEX_NAME = 'idx_crf_subject_external'
);
SET @sql = IF(@idx = 0,
  'ALTER TABLE crf_subject ADD KEY idx_crf_subject_external (external_id)',
  'SELECT ''idx_crf_subject_external exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_subject' AND INDEX_NAME = 'idx_crf_subject_microchip'
);
SET @sql = IF(@idx = 0,
  'ALTER TABLE crf_subject ADD KEY idx_crf_subject_microchip (microchip_id)',
  'SELECT ''idx_crf_subject_microchip exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
