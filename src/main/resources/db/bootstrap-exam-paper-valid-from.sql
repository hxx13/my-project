-- 试卷有效期起（幂等，重复加列由启动链 isBenignInChain 吞掉）
ALTER TABLE exam_paper ADD COLUMN valid_from DATETIME NULL COMMENT '有效期起';
