-- 字段版本（与 common/schema/V20260828__nhp_field_version.sql 同源）。
-- 幂等：唯一键改为 (dictionary_id, field_code, version)；跨套可同 field_code。

SET @db = DATABASE();

-- 丢弃旧 (dictionary_id, field_code) 唯一键
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND INDEX_NAME = 'uk_crf_field_dict_code'),
    'ALTER TABLE crf_field DROP INDEX uk_crf_field_dict_code',
    'SELECT ''uk_crf_field_dict_code gone'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 丢弃早期误写的全局 (field_code, version) 唯一键（若存在）
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND INDEX_NAME = 'uk_crf_field_code_ver'),
    'ALTER TABLE crf_field DROP INDEX uk_crf_field_code_ver',
    'SELECT ''uk_crf_field_code_ver gone'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 新增 (dictionary_id, field_code, version) 唯一键
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_field' AND INDEX_NAME = 'uk_crf_field_dict_code_ver'),
    'SELECT ''uk_crf_field_dict_code_ver exists''',
    'ALTER TABLE crf_field ADD UNIQUE KEY uk_crf_field_dict_code_ver (dictionary_id, field_code, version)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
