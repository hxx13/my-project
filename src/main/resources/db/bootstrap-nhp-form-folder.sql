-- NHP 表单文件夹归类（与 common/schema/V20260826001__nhp_form_folder.sql 同源）。
-- 文件夹本体复用 aup_folder（owner_type='NHP_FORM'），此处只加 crf_form 的归属列。
-- 幂等：重复执行时列/索引已存在即跳过。

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND COLUMN_NAME = 'folder_id'
    ),
    'SELECT ''crf_form.folder_id exists''',
    'ALTER TABLE crf_form ADD COLUMN folder_id BIGINT NULL COMMENT ''归属文件夹 FK→aup_folder.id（owner_type=NHP_FORM）；NULL=未分类'' AFTER description'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_form' AND INDEX_NAME = 'idx_crf_form_folder'
    ),
    'SELECT ''idx_crf_form_folder exists''',
    'CREATE INDEX idx_crf_form_folder ON crf_form (folder_id)'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
