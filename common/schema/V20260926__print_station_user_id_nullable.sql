-- print_station.user_id 放宽为可空：SERVER 直发工位没有也无须专用账号。
--
-- 只有 KIOSK 工位需要一个账号登录工位页；直发工位由后端执行，没有「谁登录」这回事。
-- 强行塞一个占位账号是往数据里写谎话，也会让「按账号反查工位」多出一条永远查不到的记录。
--
-- UNIQUE KEY uq_print_station_user 不用动 —— MySQL 的唯一索引允许多个 NULL，
-- 所以可以并存多个直发工位。
--
-- 幂等：bootstrap 侧走 db/bootstrap-print-station-user-id-nullable.sql
-- （先查 information_schema.IS_NULLABLE）。本文件仅作归档记录，服务器上手动执行。
ALTER TABLE print_station
    MODIFY user_id VARCHAR(50) NULL COMMENT '工位专用账号的 user.id；直发工位为 NULL';
