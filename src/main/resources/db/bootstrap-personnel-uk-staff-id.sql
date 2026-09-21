-- 教职工侧身份键：staff_id 升为可空唯一（与 common/schema/V20260919__personnel_identity_keys.sql 同源）。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'uk_personnel_staff_id'),
    'SELECT ''uk_personnel_staff_id exists''',
    'ALTER TABLE personnel ADD UNIQUE KEY uk_personnel_staff_id (staff_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
