-- 场次自动发布的起止周期（幂等，重复加列由启动链 isBenignInChain 吞掉）
ALTER TABLE training ADD COLUMN recurrence_start DATE NULL COMMENT '循环起始日期';
ALTER TABLE training ADD COLUMN recurrence_end DATE NULL COMMENT '循环截至日期';
