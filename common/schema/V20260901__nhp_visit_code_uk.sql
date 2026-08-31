-- V20260901：crf_visit.code 唯一键从全局 (code) 改为 (scheme_id, code)。
-- 目的：多方案各自拥有 TP01..TP12；新建方案时克隆默认方案不再撞 code 唯一键。
-- 同源：src/main/resources/db/bootstrap-nhp-visit-code-uk.sql
ALTER TABLE crf_visit DROP INDEX uk_crf_visit_code;
ALTER TABLE crf_visit ADD UNIQUE KEY uk_crf_visit_scheme_code (scheme_id, code);
