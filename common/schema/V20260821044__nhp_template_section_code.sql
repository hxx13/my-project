-- NHP 原子优先种子：模板章节 code 加宽（archive; runtime bootstrap-nhp-template-section-code.sql）
-- crf_form.code 已在 V20260821040 加宽至 VARCHAR(64)；呈现层 crf_template_section.code 须对齐，
-- 否则 seedAtomsFromPriorityJson 写入 snake_case 原子名（如 perfusion_hemodynamics，22 字符）会截断失败。

ALTER TABLE crf_template_section
    MODIFY COLUMN code VARCHAR(64) NOT NULL COMMENT '段/小节标识（原子=snake_case 如 donor_profile；存量 D1/D1.01）';

ALTER TABLE crf_composite_atom
    MODIFY COLUMN atom_code VARCHAR(64) NOT NULL COMMENT '原子模板编码（snake_case 或存量 D1）';
