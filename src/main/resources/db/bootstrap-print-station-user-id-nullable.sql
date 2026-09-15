-- print_station.user_id 放宽为可空。
--
-- 只有 KIOSK 工位需要一个专用账号登录工位页；SERVER 直发工位由后端执行，
-- 压根没有"谁登录"这回事，强行塞一个占位账号是往数据里写谎话。
--
-- UNIQUE KEY uq_print_station_user 不用动 —— MySQL 的唯一索引允许多个 NULL，
-- 所以可以并存多个直发工位。
--
-- 幂等：先查当前是否已经是可空。
SET @stmt = (SELECT IF(
  (SELECT IS_NULLABLE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_station' AND COLUMN_NAME = 'user_id') = 'NO',
  'ALTER TABLE print_station MODIFY user_id VARCHAR(50) NULL COMMENT ''工位专用账号的 user.id；直发工位为 NULL''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
