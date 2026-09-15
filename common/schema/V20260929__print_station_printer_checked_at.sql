-- print_station 增加「打印机探测时间」字段。
--
-- 与 printer_online 配对：判断连通性结论的新鲜度。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-station-printer-checked-at.sql（先查 information_schema
-- 再 ALTER）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_station
    ADD COLUMN printer_checked_at DATETIME NULL COMMENT '打印机连通性上次探测时间';
