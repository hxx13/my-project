-- 人员归属锚定：部门 id（与 common/schema/V20260922__personnel_org_ids.sql 同源）
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'department_id'),
    'SELECT ''personnel.department_id exists''',
    'ALTER TABLE personnel ADD COLUMN department_id BIGINT NULL COMMENT ''归属部门 department.id（按名字锚定）'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
