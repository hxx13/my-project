-- 学生侧身份键：aro_user_id 升为可空唯一（与 common/schema/V20260919__personnel_identity_keys.sql 同源）。
-- MySQL 唯一索引允许多个 NULL，故只有教职工账号的行不会互斥。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'uk_personnel_aro_user_id'),
    'SELECT ''uk_personnel_aro_user_id exists''',
    'ALTER TABLE personnel ADD UNIQUE KEY uk_personnel_aro_user_id (aro_user_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
