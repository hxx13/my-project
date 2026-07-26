-- ============================================================
-- aro_personnel 加 open_id 列（微信 OpenID 主存储）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 自动幂等执行
-- ============================================================

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aro_personnel' AND COLUMN_NAME = 'open_id');
SET @sql = IF(@col = 0,
    'ALTER TABLE aro_personnel ADD COLUMN open_id VARCHAR(128) DEFAULT NULL COMMENT ''微信OpenID''',
    'SELECT ''column open_id already exists in aro_personnel''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 确保索引存在（幂等：MySQL 重复创建同名索引会报错，用存储过程安全添加）
CREATE PROCEDURE IF NOT EXISTS ensure_aro_open_id_idx()
BEGIN
    SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aro_personnel' AND INDEX_NAME = 'idx_aro_open_id');
    IF @idx = 0 THEN
        ALTER TABLE aro_personnel ADD INDEX idx_aro_open_id (open_id);
    END IF;
END;
CALL ensure_aro_open_id_idx();
DROP PROCEDURE IF EXISTS ensure_aro_open_id_idx;
