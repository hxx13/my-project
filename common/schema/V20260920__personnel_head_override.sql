-- 头像本地覆盖层：展示取 COALESCE(NULLIF(head_override,''), head)。
-- 同步永不写本列，避免管理员设的头像被 ARO 同步值冲掉。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'head_override'),
    'SELECT ''head_override exists''',
    'ALTER TABLE personnel ADD COLUMN head_override VARCHAR(512) NULL COMMENT ''本地头像覆盖层'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
