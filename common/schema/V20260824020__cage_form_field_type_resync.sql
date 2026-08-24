-- 模板快照 cage_form_field 的类型列以字典 cage_info_field 为准回灌。
--
-- 背景：D1-D4 原子模板生成于 cage_info_field 的 data_type 规范化（小写题型 → 大写 11 种）
-- 与 field_type 回填之前，快照因此长期携带 data_type=小写题型、field_type=NULL。
-- 后果：前端 fieldType 为空 → 30 个字段全部退化成 text 控件 → INTEGER/BOOLEAN 值被
-- text 分支的 `typeof val === "string" ? val : ""` 守卫抹成空白；而后端校验只认字典的
-- 真类型，往退化成文本框的数字字段写入即 400，@Transactional 整次 PUT 回滚
-- （表现为 cage_info_value 全库 fill_source='MANUAL' 零行）。
--
-- 校验侧只读字典，快照与字典不一致按定义即脏数据，故无条件回灌。
-- 幂等：仅更新与字典不一致的行；与 CageInfoFormSchemaMigrator.resyncTemplateFieldTypes() 同语义。

UPDATE cage_form_field ff
    JOIN cage_info_field f ON f.id = ff.field_id
SET ff.data_type  = f.data_type,
    ff.field_type = f.field_type
WHERE NOT (ff.data_type <=> f.data_type)
   OR NOT (ff.field_type <=> f.field_type);
