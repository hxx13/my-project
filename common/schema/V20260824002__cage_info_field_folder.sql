-- 笼位字段字典文件夹分类（与 cage_info_codelist.folder 同语义）
ALTER TABLE cage_info_field
    ADD COLUMN IF NOT EXISTS folder VARCHAR(64) NULL COMMENT '文件夹分类（NULL=未分类）' AFTER dict_key;

CREATE INDEX IF NOT EXISTS idx_cage_info_field_folder ON cage_info_field (folder);
