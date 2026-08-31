-- 访视时点 code 唯一键（与 common/schema/V20260901__nhp_visit_code_uk.sql 同源）。
-- 幂等：唯一键从全局 (code) 改为 (scheme_id, code)；多方案各自可拥有 TP01..TP12。

SET @db = DATABASE();

-- 丢弃旧的全局 code 唯一键
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_visit' AND INDEX_NAME = 'uk_crf_visit_code'),
    'ALTER TABLE crf_visit DROP INDEX uk_crf_visit_code',
    'SELECT ''uk_crf_visit_code gone'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 新增 (scheme_id, code) 唯一键
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_visit' AND INDEX_NAME = 'uk_crf_visit_scheme_code'),
    'SELECT ''uk_crf_visit_scheme_code exists''',
    'ALTER TABLE crf_visit ADD UNIQUE KEY uk_crf_visit_scheme_code (scheme_id, code)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
