-- 培训系列：学生端手动排序序号（幂等，重复加列由启动链 isBenignInChain 吞掉）
ALTER TABLE training ADD COLUMN student_sort INT NOT NULL DEFAULT 0 COMMENT '学生端排序序号';
