-- print_station 增加「执行方式」字段。
--
-- KIOSK  = 老路子：工位电脑打开工位页，浏览器渲染后走那台机器的默认打印机。
-- SERVER = 后端直发：后端把 PDF 交给本机打印队列（生产上是 CUPS 的 lp）送到网络打印机。
--
-- SERVER 只给一种场景用 —— 打印机所在网段没有任何常开的电脑可以挂工位页。
-- 此时 printer_ip 不再是纯记录，它就是投递目标（生产上 CUPS 队列名就用这个 IP）。
--
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_station' AND COLUMN_NAME = 'mode') = 0,
  'ALTER TABLE print_station ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT ''KIOSK'' COMMENT ''KIOSK=工位电脑执行 / SERVER=后端直发''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
