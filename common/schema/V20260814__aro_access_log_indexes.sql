-- 为 aro_access_log 高频时间/用户查询补充索引（服务器归档迁移，与 db/bootstrap-aro-access-log-index.sql 同源）。
-- 目标：去除查询里的 CAST(create_time) 后，getTodayActiveUsersForRoomStatus / getTodayRecords 等走索引，避免全表扫描。

ALTER TABLE aro_access_log
    ADD INDEX idx_access_log_user_time (user_id, create_time),
    ADD INDEX idx_access_log_time_type (accessType, create_time);
