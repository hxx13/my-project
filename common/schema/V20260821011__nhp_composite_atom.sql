-- 归档：NHP 组合模板原子引用表（与 db/bootstrap-nhp-composite-atom.sql 同源）
CREATE TABLE IF NOT EXISTS crf_composite_atom (
    id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    composite_form_id  BIGINT       NOT NULL COMMENT 'FK→crf_form.id（组合模板该版本行）',
    atom_code          VARCHAR(16)  NOT NULL COMMENT '原子模板编码，如 D1',
    atom_form_id       BIGINT       NOT NULL COMMENT '钉住的原子模板版本行 FK→crf_form.id',
    sort_order         INT          NOT NULL DEFAULT 0 COMMENT '组合内顺序（TOC 章节序）',
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_comp_atom (composite_form_id, atom_code),
    KEY idx_crf_comp_atom_form (composite_form_id),
    KEY idx_crf_comp_atom_pin (atom_form_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='NHP组合模板的原子引用（钉版本；发布时结构已快照进 crf_template_*）';
