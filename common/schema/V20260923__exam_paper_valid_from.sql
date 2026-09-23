-- 试卷有效期起（空 = 不限制开始时间）
ALTER TABLE exam_paper ADD COLUMN valid_from DATETIME NULL COMMENT '有效期起';
