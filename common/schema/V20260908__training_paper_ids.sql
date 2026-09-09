-- 培训系列：试卷多选绑定（JSON 数组，如 [1,2,3]）
ALTER TABLE training ADD COLUMN paper_ids_json TEXT NULL COMMENT '绑定试卷 id JSON 数组';
