-- 培训场次：时间限制从系列下移到场次（training.time_limit 保留不动）。
-- 与 common/schema/V20260908__training_occurrence_time_limit.sql 同源，幂等：列已存在即跳过。
ALTER TABLE training_occurrence ADD COLUMN time_limit INT NULL COMMENT '时间限制（分钟）';
