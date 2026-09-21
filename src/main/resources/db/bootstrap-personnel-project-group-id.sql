-- 人员归属锚定：课题组 id（与 common/schema/V20260922__personnel_org_ids.sql 同源）
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'project_group_id'),
    'SELECT ''personnel.project_group_id exists''',
    'ALTER TABLE personnel ADD COLUMN project_group_id BIGINT NULL COMMENT ''归属课题组 project_group.id（按名字锚定）'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
