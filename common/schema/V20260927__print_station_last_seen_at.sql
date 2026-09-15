-- print_station 增加「KIOSK 心跳时间」字段。
--
-- KIOSK 工位页每次轮询时回写，用于判断工位电脑是否还活着。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-station-last-seen.sql（先查 information_schema
-- 再 ALTER）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_station
    ADD COLUMN last_seen_at DATETIME NULL COMMENT 'KIOSK 工位页最后一次心跳时间';
