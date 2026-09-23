-- 试卷有效期止（空 = 不限制截止时间）
ALTER TABLE exam_paper ADD COLUMN valid_to DATETIME NULL COMMENT '有效期止';
