-- 项目级访视编排（与 common/schema/V20260826003__nhp_project_visit_plan.sql 同源）。
-- 幂等：表已存在即跳过。

CREATE TABLE IF NOT EXISTS crf_project_visit_plan (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    transplant_id BIGINT       NOT NULL COMMENT '所属项目 FK→crf_transplant.id',
    visit_id      BIGINT       NOT NULL COMMENT 'TP 时点 FK→crf_visit.id',
    atom_id       BIGINT       NOT NULL COMMENT '表单 FK→crf_form.id',
    required      TINYINT      NOT NULL DEFAULT 1 COMMENT '是否必采',
    capture_form  VARCHAR(16)  NULL COMMENT '采集形态 PANEL/LEDGER/SERIES',
    sort_order    INT          NOT NULL DEFAULT 0,
    UNIQUE KEY uk_crf_project_visit_plan (transplant_id, visit_id, atom_id),
    KEY idx_crf_project_visit_plan_project (transplant_id),
    KEY idx_crf_project_visit_plan_visit (visit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
