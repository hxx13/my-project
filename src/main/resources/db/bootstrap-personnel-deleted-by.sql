-- 人员回收站：记录删除操作人（与 common/schema/V20260924__personnel_recycle_bin.sql 同源）
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'deleted_by'),
    'SELECT ''personnel.deleted_by exists''',
    'ALTER TABLE personnel ADD COLUMN deleted_by VARCHAR(64) NULL COMMENT ''回收站：执行删除的账号 id'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
