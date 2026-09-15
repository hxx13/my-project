-- print_station 增加「打印机连通性」字段。
--
-- 只给 SERVER 工位用（后端直发）：后端每隔一段时间探一次 printer_ip 通不通，
-- 结果落在这里，给现场一眼看出「是打印机断了还是工位断了」。
--
-- NULL 与 0 语义不同：
--   NULL = 从没探过（新工位 / 刚切到 SERVER 还没跑第一轮）
--   0    = 探过，不通
--   1    = 探过，通
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_station' AND COLUMN_NAME = 'printer_online') = 0,
  'ALTER TABLE print_station ADD COLUMN printer_online TINYINT(1) NULL COMMENT ''最近一次探测打印机是否连通；NULL=从没探过，0=不通，1=通''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
