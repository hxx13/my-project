-- =============================================================
-- NHP 版号补位：唯一键仅约束活跃行，软删后版号可复用（不改写存量 version）
-- 启动幂等：db/bootstrap-nhp-version-reuse.sql
--
-- 应用层须 insert-or-reactivate（见 NhpTemplateService / NhpCodelistService）；
-- 本迁移为 UK 防御网，与复活路径配套，非替代。
-- =============================================================

-- crf_form：(study_id, code, version) → 仅 active=1 时 version 参与唯一
ALTER TABLE crf_form DROP INDEX uk_crf_form_study_code_ver;
ALTER TABLE crf_form
  ADD UNIQUE KEY uk_crf_form_study_code_active_ver (
    study_id,
    code,
    ((CASE WHEN `active` = 1 THEN `version` ELSE NULL END))
  );

-- crf_codelist：(code, version) → 仅 active=1 时 version 参与唯一
ALTER TABLE crf_codelist DROP INDEX uk_crf_codelist_code_ver;
ALTER TABLE crf_codelist
  ADD UNIQUE KEY uk_crf_codelist_code_active_ver (
    code,
    ((CASE WHEN `active` = 1 THEN `version` ELSE NULL END))
  );
