-- 培训系列：学生端校区分组（幂等，重复加列由启动链 isBenignInChain 吞掉）
ALTER TABLE training ADD COLUMN campus VARCHAR(32) NULL COMMENT '学生端校区分组';
