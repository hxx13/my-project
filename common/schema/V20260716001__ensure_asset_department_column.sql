-- 确保「管理部门」动态列存在
-- 若已有数据的列被误删，此脚本会重建列定义（不恢复历史数据）
-- 若列已存在，此脚本为幂等操作（不重复创建）

INSERT IGNORE INTO asset_column_def (column_key, column_label, value_type, sortable, searchable, sort_order, create_by)
VALUES ('col_管理部门', '管理部门', 'TEXT', 1, 1, 10, 'system');

-- 如果列已存在但 label 不一致，修正 label
UPDATE asset_column_def SET column_label = '管理部门' WHERE column_key = 'col_管理部门' AND column_label != '管理部门';
