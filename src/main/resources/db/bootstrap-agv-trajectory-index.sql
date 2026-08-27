-- AGV 轨迹表 station 查询索引（老表补索引，幂等）
-- 不能并入 bootstrap-agv-trajectory-fields.sql：该脚本首个 ADD COLUMN 在已存在的表上会抛 duplicate column，
-- 而 doRunSilently 用 continueOnError=false，脚本就此停住，末尾的 ADD INDEX 永远执行不到。
-- 因此独立成脚本；重复执行时 duplicate key name 会被 isBenignInChain 吞掉。
ALTER TABLE agv_trajectory ADD INDEX idx_station_time (station, recorded_at);
