-- ============================================================
-- 动物订购可购窗口：start_weekday / end_weekday（跨星期连续区间 Form B）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动幂等执行。
-- 同源：common/schema/V20260821024__animal_order_window_rule_week_span.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'animal_order_window_rule' AND COLUMN_NAME = 'start_weekday'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE animal_order_window_rule ADD COLUMN start_weekday TINYINT NULL COMMENT ''WEEKLY_SPAN：起始ISO星期 1=周一…7=周日'' AFTER weekdays',
  'SELECT ''start_weekday exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'animal_order_window_rule' AND COLUMN_NAME = 'end_weekday'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE animal_order_window_rule ADD COLUMN end_weekday TINYINT NULL COMMENT ''WEEKLY_SPAN：结束ISO星期 1=周一…7=周日'' AFTER start_weekday',
  'SELECT ''end_weekday exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
