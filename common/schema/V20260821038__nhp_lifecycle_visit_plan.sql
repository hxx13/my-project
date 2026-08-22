-- NHP lifecycle + visit_plan（archive; runtime bootstrap-nhp-lifecycle-visit-plan.sql）
-- V20260821038 §6.5③
-- arm_code：研究分组 HEART/LIVER（非独立研究）— product direction confirmed

ALTER TABLE crf_subject
    ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(20) NULL COMMENT 'SCREENING/MATCHING/POST_TX/ENDPOINT' AFTER status;

ALTER TABLE crf_subject
    ADD COLUMN IF NOT EXISTS arm_code VARCHAR(16) NULL COMMENT '研究分组 HEART/LIVER（非独立研究）' AFTER lifecycle_stage;

CREATE TABLE IF NOT EXISTS crf_visit_plan (
    id         BIGINT  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    visit_id   BIGINT  NOT NULL COMMENT 'FK→crf_visit（TP 定义）',
    atom_id    BIGINT  NOT NULL COMMENT 'FK→crf_form（原子）',
    required   TINYINT NOT NULL DEFAULT 1 COMMENT '该访视必做',
    sort_order INT     NOT NULL DEFAULT 0,
    UNIQUE KEY uk_crf_visit_plan (visit_id, atom_id),
    KEY idx_crf_visit_plan_visit (visit_id),
    KEY idx_crf_visit_plan_atom (atom_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP 访视编排（访视容器×原子清单）';
