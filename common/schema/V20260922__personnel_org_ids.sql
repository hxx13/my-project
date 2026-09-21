-- 归档迁移，与 db/bootstrap-personnel-{department-id,department-id-idx,project-group-id,project-group-id-idx,org-id-backfill}.sql 同源。
-- 人员归属 id 锚定：personnel 加 department_id / project_group_id 两列 + 两索引 + 按名字回填。
-- 收益：改名只需改字典一行，显示以字典为权威，且不被 ARO 同步冲回。
-- 幂等：逐列/逐索引 information_schema 守卫；回填只在 id 为空时执行。

-- ① personnel.department_id
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'department_id'),
    'SELECT ''personnel.department_id exists''',
    'ALTER TABLE personnel ADD COLUMN department_id BIGINT NULL COMMENT ''归属部门 department.id（按名字锚定）'''
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② idx_personnel_department_id
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'idx_personnel_department_id'),
    'SELECT ''idx_personnel_department_id exists''',
    'ALTER TABLE personnel ADD INDEX idx_personnel_department_id (department_id)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ personnel.project_group_id
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'project_group_id'),
    'SELECT ''personnel.project_group_id exists''',
    'ALTER TABLE personnel ADD COLUMN project_group_id BIGINT NULL COMMENT ''归属课题组 project_group.id（按名字锚定）'''
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ④ idx_personnel_project_group_id
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'idx_personnel_project_group_id'),
    'SELECT ''idx_personnel_project_group_id exists''',
    'ALTER TABLE personnel ADD INDEX idx_personnel_project_group_id (project_group_id)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ⑤ 回填：只在 id 为空时按名字解析（改名后文本对不上，也不会清空已有 id）
UPDATE personnel p JOIN department d ON d.name = p.department_name
   SET p.department_id = d.id
 WHERE p.department_id IS NULL AND p.department_name IS NOT NULL AND p.department_name <> '';
UPDATE personnel p JOIN project_group g ON g.name = p.project_group_name
   SET p.project_group_id = g.id
 WHERE p.project_group_id IS NULL AND p.project_group_name IS NOT NULL AND p.project_group_name <> '';
-- 兼容「一人两组」的历史逗号串（14 行）：优先锚定到「<本人姓名>的课题组」，取不到再取第一个组。
UPDATE personnel p JOIN project_group g ON g.name = CONCAT(p.name, '的课题组')
   SET p.project_group_id = g.id
 WHERE p.project_group_id IS NULL AND p.project_group_name LIKE '%,%';
UPDATE personnel p JOIN project_group g ON g.name = TRIM(SUBSTRING_INDEX(p.project_group_name, ',', 1))
   SET p.project_group_id = g.id
 WHERE p.project_group_id IS NULL AND p.project_group_name LIKE '%,%';
