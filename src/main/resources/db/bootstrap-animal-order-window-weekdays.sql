-- ============================================================
-- 动物订购可购窗口：weekdays（按星期循环）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动幂等执行。
-- 同源：common/schema/V20260821023__animal_order_window_rule_weekdays.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'animal_order_window_rule' AND COLUMN_NAME = 'weekdays'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE animal_order_window_rule ADD COLUMN weekdays VARCHAR(32) NULL COMMENT ''ISO星期逗号分隔 1=周一…7=周日；WEEKLY必填'' AFTER shape',
  'SELECT ''weekdays exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE animal_order_window_rule
SET shape = 'WEEKLY',
    weekdays = '1,2,3,4,5,6,7'
WHERE shape = 'DAILY'
  AND (weekdays IS NULL OR weekdays = '');
