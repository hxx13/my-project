-- 滞留违规文案模板支持富文本 HTML：VARCHAR(500) -> TEXT（幂等，仅当当前为有限长度 VARCHAR 时执行）
SET @need_widen := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stranded_violation_config'
    AND COLUMN_NAME = 'violation_text_tpl'
    AND DATA_TYPE = 'varchar'
    AND COALESCE(CHARACTER_MAXIMUM_LENGTH, 0) > 0
    AND COALESCE(CHARACTER_MAXIMUM_LENGTH, 0) < 65535
);
SET @sql := IF(
  @need_widen > 0,
  'ALTER TABLE stranded_violation_config MODIFY COLUMN violation_text_tpl TEXT DEFAULT ''${name}(${dept})滞留未签退，系统自动登记'' COMMENT ''违规文案模板（富文本 HTML，支持 ${name}/${dept}/${date} 变量）''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
