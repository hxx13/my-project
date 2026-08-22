-- NHP 字段属性 vs 填写方式配合（archive; runtime bootstrap-nhp-template-field-datatype.sql）
-- V20260821041：crf_template_field 加 dataType（字段存储类型权威快照，约束前端可选题型）
-- dataType 权威在 crf_field；模板层存快照仅用于编辑器按 dataType 过滤控件 type，不承载业务校验

ALTER TABLE crf_template_field
    ADD COLUMN IF NOT EXISTS data_type VARCHAR(32) NULL COMMENT '字段存储类型 STRING/TEXT/INTEGER/DECIMAL/DATE/DATETIME/ENUM/ENUM_MULTI/BOOLEAN/FILE/CALC（快照，约束控件 type）' AFTER field_key;
