-- ============================================================
-- aro_personnel 表加 open_id 列（微信 OpenID 主存储）
-- ============================================================

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aro_personnel' AND COLUMN_NAME = 'open_id');
SET @sql = IF(@col = 0,
    'ALTER TABLE aro_personnel ADD COLUMN open_id VARCHAR(128) DEFAULT NULL COMMENT ''微信OpenID''',
    'SELECT ''column open_id already exists in aro_personnel''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
