-- =============================================================
-- NHP 字段字典套：structure_json（域/子模块大纲，可先于字段）
-- 与 db/bootstrap-nhp-field-dictionary.sql 中幂等补列同源
-- =============================================================

-- Flyway：若列已存在则本脚本在手工重跑时可能失败；启动 bootstrap 用 information_schema 幂等。
ALTER TABLE crf_field_dictionary
  ADD COLUMN structure_json TEXT NULL COMMENT '域/子模块大纲 JSON：{domains:[{code,name,submodules:[{code,name}]}]}' AFTER description;
