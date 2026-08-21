-- =============================================================
-- NHP structure_json：域/子模块展示序用 sortOrder（表码 Dn ≠ 序号）
-- 数据仍存 JSON；本脚本仅更新列注释，便于运维对照。
-- =============================================================

ALTER TABLE crf_field_dictionary
  MODIFY COLUMN structure_json TEXT NULL
    COMMENT '域/子模块大纲 JSON：{domains:[{code,name,sortOrder,submodules:[{code,name,sortOrder}]}]}；sortOrder=展示序，code=表码/id';
