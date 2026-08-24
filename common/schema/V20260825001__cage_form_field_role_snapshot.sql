-- V20260825001：模板快照 cage_form_field 增列 role（字段角色快照），并以字典 cage_info_field.role 回灌。
--
-- 背景：cage_info_field 本就有 role 列（PK/FK/VALUE/DERIVED，缺省 VALUE，NHP 同语义），
-- 但发布模板快照 cage_form_field 未落 role，导致详情弹窗（CageFormFill）无法区分
-- 「可手填」（VALUE，含码表选择）与「自动获取只读」（DERIVED/PK/FK），编辑功能把只读字段也当文本框放开。
-- 本迁移给快照补 role 并回灌，使详情弹窗按 role 渲染只读/可选择/可填写。
--
-- 注意：PK/DERIVED 等取值引擎暂未接入（占位）。role 仅控制「详情弹窗只读 + 拒绝手动写入」，
-- 取值只来自外部同步或后续接入的笼位自有引擎，绝不调用 NHP 取号器。
--
-- 执行路径：与 V20260824020 同，实际幂等建列/回灌走 CageInfoFormSchemaMigrator
-- （@Order(133) ApplicationRunner，createTemplateTables + resyncTemplateSnapshot），本文件仅存档。
-- 幂等：ADD COLUMN IF NOT EXISTS + 仅回灌与字典不一致的行。

ALTER TABLE cage_form_field
    ADD COLUMN IF NOT EXISTS role VARCHAR(16) NULL COMMENT '字段角色快照 PK/FK/VALUE/DERIVED（缺省 VALUE）' AFTER dict_key;

UPDATE cage_form_field ff
    JOIN cage_info_field f ON f.id = ff.field_id
SET ff.role = f.role
WHERE NOT (ff.role <=> f.role);
