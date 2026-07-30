-- ARO 培训学员审核/评分时间戳
ALTER TABLE aro_training_trainee ADD COLUMN reviewed_at DATETIME NULL COMMENT '审核时间';
ALTER TABLE aro_training_trainee ADD COLUMN scored_at   DATETIME NULL COMMENT '评分时间';
