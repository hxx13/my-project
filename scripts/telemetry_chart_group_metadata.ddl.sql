-- 增量 DDL：遥测对比组变量元数据（展示名/楼层/指标类型等，来源 watchlist）
-- 目标库 twin_system（或 application.properties 配置的库）执行一次

SET @col_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'telemetry_chart_group'
      AND COLUMN_NAME = 'variable_metadata_json'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE telemetry_chart_group ADD COLUMN variable_metadata_json TEXT NULL COMMENT ''变量元数据 JSON 数组（variableName/displayLabel/floorCode/metricKindCode/bundleCode/roomCanonical）'' AFTER variable_names_json',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
