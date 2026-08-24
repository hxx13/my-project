-- =============================================================
-- form_field 码表绑定钉版本：dict_version NULL=跟随最新已发布，publish 时回填
-- 归档迁移，与 src/main/resources/db/bootstrap-aup-field-dict-version.sql 同源。
-- =============================================================

ALTER TABLE form_field
    ADD COLUMN dict_version INT NULL COMMENT '发布时钉住的 dict 版本；NULL=跟随最新已发布' AFTER dict_key;
