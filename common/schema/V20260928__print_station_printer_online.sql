-- print_station 增加「打印机连通性」字段。
--
-- NULL 与 0 语义不同：NULL=从没探过，0=探过不通，1=探过通。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-station-printer-online.sql（先查 information_schema
-- 再 ALTER）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_station
    ADD COLUMN printer_online TINYINT(1) NULL COMMENT '最近一次探测打印机是否连通；NULL=从没探过，0=不通，1=通';
