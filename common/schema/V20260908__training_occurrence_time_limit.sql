-- 培训场次：时间限制从系列下移到场次（training.time_limit 保留不动）
ALTER TABLE training_occurrence ADD COLUMN time_limit INT NULL COMMENT '时间限制（分钟）';
