-- =============================================================
-- NHP 码表整表版本：同一 code 多版本行（对齐模板 formKey+version）
-- 变更走版本流程，禁止直接改已冻结取值。
-- 启动幂等脚本：db/bootstrap-nhp-codelist-version.sql
-- =============================================================

-- 旧唯一键 code → (code, version)；随后 V20260821018 改为仅约束 active=1（版号可补位）
ALTER TABLE crf_codelist DROP INDEX uk_crf_codelist_code;
ALTER TABLE crf_codelist ADD UNIQUE KEY uk_crf_codelist_code_ver (code, version);

-- 存量 ACTIVE 视为可编辑草稿（与 UI/状态机一致）
UPDATE crf_codelist SET status = 'DRAFT' WHERE status = 'ACTIVE' AND active = 1;
