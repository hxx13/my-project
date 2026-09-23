-- 培训系列：学生端校区分组（浦东 / 浦西），空 = 未分组
ALTER TABLE training ADD COLUMN campus VARCHAR(32) NULL COMMENT '学生端校区分组';
