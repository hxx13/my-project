-- NHP 已发布表单的文件夹归类。
-- 文件夹本体复用 aup_folder（owner_type='NHP_FORM'），此处只给 crf_form 加归属外键列。
-- 用 folder_id 而非 folder 字符串：重命名文件夹不破坏归属，且删除文件夹时可做引用计数保护。

ALTER TABLE crf_form
    ADD COLUMN IF NOT EXISTS folder_id BIGINT NULL
    COMMENT '归属文件夹 FK→aup_folder.id（owner_type=NHP_FORM）；NULL=未分类' AFTER description;

CREATE INDEX IF NOT EXISTS idx_crf_form_folder ON crf_form (folder_id);
