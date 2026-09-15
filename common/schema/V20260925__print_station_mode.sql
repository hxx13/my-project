-- 打印工位增加「执行方式」：KIOSK（工位电脑执行）/ SERVER（后端直发）。
--
-- SERVER 只给一种场景用 —— 打印机所在网段没有任何常开的电脑可以挂工位页
-- （172.22.138.6 就是这种情况）。此时后端自己把 PDF 交给本机打印队列
-- （生产上是 CUPS 的 lp）送到打印机，printer_ip 从「纯记录」变成「投递目标」。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-station-mode.sql（先查 information_schema
-- 再 ALTER）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_station
    ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'KIOSK' COMMENT 'KIOSK=工位电脑执行 / SERVER=后端直发';
