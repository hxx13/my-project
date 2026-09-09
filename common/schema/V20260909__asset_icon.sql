-- 资产与地点图标（emoji）
-- 仅作历史归档：asset_record 由 AssetSchemaMigrator（ApplicationRunner）创建，晚于启动链；
-- asset_location 虽在 bootstrap-asset-location.sql 建表，但为了两列同处一地，
-- 运行时统一由 AssetSchemaMigrator.ensureColumnExists 补列，本文件不参与启动执行。
ALTER TABLE asset_record ADD COLUMN icon VARCHAR(16) NULL COMMENT '资产图标 emoji';
ALTER TABLE asset_location ADD COLUMN icon VARCHAR(16) NULL COMMENT '地点图标 emoji';
