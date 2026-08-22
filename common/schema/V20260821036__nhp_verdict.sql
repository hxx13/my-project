-- NHP verdict 校对维度（archive; runtime bootstrap-nhp-verdict.sql）
-- V20260821036 §6.5①
-- Do NOT add timepoint to crf_field; Do NOT add role (already on form_field)

ALTER TABLE crf_field
    ADD COLUMN IF NOT EXISTS verdict VARCHAR(16) NULL COMMENT '校对四态 CONFIRM/MODIFY/DELETE/QUESTION' AFTER concept_code;

ALTER TABLE crf_field
    ADD COLUMN IF NOT EXISTS verdict_note TEXT NULL COMMENT 'PI 校对意见' AFTER verdict;

ALTER TABLE crf_field
    ADD COLUMN IF NOT EXISTS review_round INT NOT NULL DEFAULT 1 COMMENT '校对轮次（第二轮商议 +1）' AFTER verdict_note;

ALTER TABLE crf_codelist_item
    ADD COLUMN IF NOT EXISTS verdict VARCHAR(16) NULL COMMENT '校对四态 CONFIRM/MODIFY/DELETE/QUESTION' AFTER sort_order;

ALTER TABLE crf_codelist_item
    ADD COLUMN IF NOT EXISTS verdict_note TEXT NULL COMMENT '码表项校对意见' AFTER verdict;
