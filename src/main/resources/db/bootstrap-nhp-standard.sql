-- ============================================================
-- NHP 标准库 seed（24 §3.5 / 25 §B：方案库 / panel / 协议 版本化）
-- EmbeddedTwinSystemCoreDdlBootstrap 幂等执行。
-- 目的：预置标准条目，让配置侧「标准库」页不再空白；剂量/靶值等医学内容待 PI 校对后补（标 DRAFT，冻结权交校对流）。
-- 说明：immu_code 对齐码表 IMMU、standard_code 对齐码表 VER（PANEL/CRITERIA/PROTOCOL/DICT），
--       具体条目名/项目集待 PI 逐条确认，此处只立骨架避免空页。
-- ============================================================

-- 方案库（crf_regimen_library，D6 免疫方案；dose_rule/target_range 医学内容待 PI）
INSERT IGNORE INTO crf_regimen_library (immu_code, version, dose_rule, target_range, status) VALUES
('INDUCTION', 1, NULL, NULL, 'DRAFT'),
('MAINTENANCE', 1, NULL, NULL, 'DRAFT'),
('RESCUE', 1, NULL, NULL, 'DRAFT');

-- 标准库版本（crf_standard_version，D12：panel / 放行标准 版本化）
INSERT IGNORE INTO crf_standard_version (standard_code, object_ref, version, version_note) VALUES
('PANEL', 'CBC-BIO', 1, '血常规+生化检测 panel（项目集待 PI 确认）'),
('PANEL', 'CFDNA', 1, '猪源 cfDNA panel（待 PI 确认）'),
('CRITERIA', 'ORGAN-RELEASE', 1, '器官放行标准（细则待 PI 确认）');

-- 协议（crf_protocol，D9/D10 协议层，版本化）
INSERT IGNORE INTO crf_protocol (protocol_code, version, title, source_doc) VALUES
('HEART-TX', 1, '部分心脏异位移植-手术方案', '《部分心脏异位移植-手术方案-20260810》'),
('LIVER-PERF', 1, '体外肝灌注方案', '急性肝衰竭检测 panel（参照）');
