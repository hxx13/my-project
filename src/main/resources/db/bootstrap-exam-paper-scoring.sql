-- 试卷评分：及格分 + 答题时限（单题分值存 exam_paper_question.config_json.score）
ALTER TABLE exam_paper ADD COLUMN qualify_score INT NOT NULL DEFAULT 80 COMMENT '及格分';
ALTER TABLE exam_paper ADD COLUMN total_time INT NULL COMMENT '答题时限（分钟）';
