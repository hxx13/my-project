-- 人员回收站：软删除标记（与 common/schema/V20260924__personnel_recycle_bin.sql 同源）
--
-- 为什么不能直接删行：personnel 是同步派生的。直接 DELETE 后，下一次人员同步会
-- 按 aro_user_id 找不到行 → 重新 INSERT 把他建回来。所以软删除必须让同步"看见但不复活"。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'deleted_at'),
    'SELECT ''personnel.deleted_at exists''',
    'ALTER TABLE personnel ADD COLUMN deleted_at DATETIME NULL COMMENT ''回收站：非空表示已软删除'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
