-- 资产域「校区」已被「存放地点树（文件夹）」取代（2026-09-12 决定）。
-- 只删列定义：删掉后它不再出现在动态列里（列表 / 抽屉 / 导出都读 asset_column_def）。
-- asset_record_value 里已有的校区值保留为孤儿数据，不再被任何查询读取。
-- 幂等：重复执行影响 0 行。单条语句（runScript 的 continueOnError=false，一个文件只能放一条 DDL）。
DELETE FROM asset_column_def
WHERE column_key IN ('col_校区', 'col_所属校区') OR column_label = '校区';
