-- 姓名降级为普通索引，仅供搜索（与 common/schema/V20260919__personnel_identity_keys.sql 同源）。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'idx_personnel_name'),
    'SELECT ''idx_personnel_name exists''',
    'ALTER TABLE personnel ADD INDEX idx_personnel_name (name)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
