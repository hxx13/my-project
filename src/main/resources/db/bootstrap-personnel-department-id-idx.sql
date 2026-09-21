-- 人员归属锚定：部门 id 索引（与 common/schema/V20260922__personnel_org_ids.sql 同源）
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'idx_personnel_department_id'),
    'SELECT ''idx_personnel_department_id exists''',
    'ALTER TABLE personnel ADD INDEX idx_personnel_department_id (department_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
