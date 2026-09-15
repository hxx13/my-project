-- print_station 增加「KIOSK 心跳时间」字段。
--
-- KIOSK 工位页每次轮询（打卡/取件）时回写一次，用于判断工位电脑是否还活着
-- （断电/关机/页面被关掉之后，这个时间就不会再前进）。
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_station' AND COLUMN_NAME = 'last_seen_at') = 0,
  'ALTER TABLE print_station ADD COLUMN last_seen_at DATETIME NULL COMMENT ''KIOSK 工位页最后一次心跳时间''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
