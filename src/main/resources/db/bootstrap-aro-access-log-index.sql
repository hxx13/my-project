-- aro_access_log 高频时间/用户查询索引。
-- create_time 为 yyyy-MM-dd HH:mm:ss 字符串；查询去除 CAST(create_time) 后走字符串比较即可命中这些索引。
-- 幂等：索引已存在时，启动链（EmbeddedTwinSystemCoreDdlBootstrap）捕获 duplicate key 视为成功。

ALTER TABLE aro_access_log
    ADD INDEX idx_access_log_user_time (user_id, create_time),
    ADD INDEX idx_access_log_time_type (accessType, create_time);
