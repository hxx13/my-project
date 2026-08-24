-- =============================================================
-- AUP 字典项 value/label 加宽（幂等）——启动自动执行
-- 同源：common/schema/V20260824017__aup_dict_item_value_width.sql
-- =============================================================
SET @db := DATABASE();

SET @vlen := (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict_item' AND COLUMN_NAME='value');
SET @sql = IF(@vlen IS NOT NULL AND @vlen < 512,
  'ALTER TABLE dict_item MODIFY COLUMN value VARCHAR(512) NOT NULL COMMENT ''落库值（稳定码，宽列承载长选项文本）''',
  'SELECT ''dict_item.value already >= 512''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @llen := (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict_item' AND COLUMN_NAME='label');
SET @sql = IF(@llen IS NOT NULL AND @llen < 512,
  'ALTER TABLE dict_item MODIFY COLUMN label VARCHAR(512) NOT NULL COMMENT ''展示文本''',
  'SELECT ''dict_item.label already >= 512''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
