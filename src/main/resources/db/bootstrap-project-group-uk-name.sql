-- 补上 V20260816__personnel_unify.sql 声明、但因表已存在而从未生效的课题组唯一键。
-- 键一建上，syncProjectGroups 的 INSERT ... ON DUPLICATE KEY UPDATE 就自动变成幂等，
-- 课题组不再每次同步膨胀。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_group' AND INDEX_NAME = 'uk_project_group_name'),
    'SELECT ''uk_project_group_name exists''',
    'ALTER TABLE project_group ADD UNIQUE KEY uk_project_group_name (name)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
