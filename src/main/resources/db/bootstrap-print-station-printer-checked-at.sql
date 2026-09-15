-- print_station 增加「打印机探测时间」字段。
--
-- 跟 printer_online 配对：光看通不通不够，还得知道这个结论是多久以前测的
-- （探了 3 小时没更新 = 探测本身也挂了）。
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_station' AND COLUMN_NAME = 'printer_checked_at') = 0,
  'ALTER TABLE print_station ADD COLUMN printer_checked_at DATETIME NULL COMMENT ''打印机连通性上次探测时间''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
