-- 目标库：twin_system（见 application.properties spring.datasource.url）
-- 滞留违规文案模板富文本：将 violation_text_tpl 从 VARCHAR(500) 扩为 TEXT
-- 本地/运维：在应用启动前或升级时于目标库执行本脚本（幂等）

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
