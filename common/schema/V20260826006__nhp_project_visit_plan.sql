-- 项目级访视编排：一个项目在每个 TP（visit）采集哪些已发布表单（atom）。
-- crf_visit_plan 保持全局表不动（事件指派矩阵的「全局模板」语义不再使用，但保留兼容）。
-- 项目未配置时为空编排 —— 项目中只有空的 TP 时间节点，不 fallback 到全局。

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
