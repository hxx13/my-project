-- NHP 原子优先种子重构（archive; runtime bootstrap-nhp-atom-priority.sql）
-- V20260821040 字段六维落地：crf_field 加 id_rule_type + nature；crf_form.code 加宽承载独立 snake_case 原子名

ALTER TABLE crf_field
    ADD COLUMN IF NOT EXISTS id_rule_type VARCHAR(16) NULL COMMENT 'PK 字段编码规则类型 DON/RCP/XM/TX/FU/AE/REG/MED/LVL/PATH/PERF/SMP/TST' AFTER concept_code;

ALTER TABLE crf_field
    ADD COLUMN IF NOT EXISTS nature VARCHAR(16) NULL COMMENT '字段性质 DATA/FK/PK/DERIVED（决定进不进题目）' AFTER id_rule_type;

ALTER TABLE crf_form
    MODIFY COLUMN code VARCHAR(64) NOT NULL COMMENT '表单编码（原子=独立 snake_case 如 donor_profile；组合模板仍为组合键）';
