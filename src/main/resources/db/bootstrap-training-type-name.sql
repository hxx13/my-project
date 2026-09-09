-- 培训系列：类型预设名称（training_type_preset.name，如 准入培训/手术培训）
ALTER TABLE training ADD COLUMN type_name VARCHAR(64) NULL COMMENT '类型预设名称';
