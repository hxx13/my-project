-- NHP 码表文件夹分类（与 common/schema/V20260821043__nhp_codelist_folder.sql 同源）。
-- 幂等：重复执行时列已存在即跳过。

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_codelist' AND COLUMN_NAME = 'folder'
    ),
    'SELECT ''crf_codelist.folder exists''',
    'ALTER TABLE crf_codelist ADD COLUMN folder VARCHAR(64) NULL COMMENT ''码表文件夹分类（分组用，NULL=未分类）'' AFTER name'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
