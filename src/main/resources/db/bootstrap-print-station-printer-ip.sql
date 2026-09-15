-- print_station 增加「打印机 IP」记录字段。
--
-- 纯记录用：知道这台工位驱动的是哪台物理机器，方便现场排查
-- （"这台打不出来" → 先看它连的是哪台打印机）。
--
-- **不参与任何打印逻辑** —— 打印仍然走「工位电脑 + 浏览器 + 默认打印机」，
-- 后端不会按这个 IP 直接发送数据（实测那台 IP 机不认 PDF，直推会打成源码）。
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_station' AND COLUMN_NAME = 'printer_ip') = 0,
  'ALTER TABLE print_station ADD COLUMN printer_ip VARCHAR(64) NULL COMMENT ''打印机 IP，纯记录用，不参与打印逻辑''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
