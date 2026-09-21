-- 补上 V20260816__personnel_unify.sql 声明、但因表已存在而从未生效的部门索引。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_group' AND INDEX_NAME = 'idx_pg_department'),
    'SELECT ''idx_pg_department exists''',
    'ALTER TABLE project_group ADD INDEX idx_pg_department (department_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
