-- NHP FK 字段指向落库（archive; runtime bootstrap-nhp-form-field-fk-target.sql）
-- V20260821042：crf_form_field 加 fk_target（FK 字段指向的实体，如 transplant/sample/regimen）

ALTER TABLE crf_form_field
    ADD COLUMN IF NOT EXISTS fk_target VARCHAR(64) NULL COMMENT 'FK 字段指向实体（transplant/sample/regimen/donor+recipient 复合）' AFTER role;
