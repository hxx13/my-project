-- 旧库升级：telemetry_chart_group 补齐 variable_metadata_json（CREATE TABLE IF NOT EXISTS 不会加新列）

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
