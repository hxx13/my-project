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

-- 确保索引存在。
-- 这里不能用 CREATE PROCEDURE + BEGIN...END：启动链用 ResourceDatabasePopulator(setSeparator(";"))，
-- 按分号裸切且不认 DELIMITER，BEGIN...END 体内的分号会把语句切碎 → 整段报错
-- → 被 isBenignInChain 判成「已存在」而计为成功 → 索引从来没建成过。
-- 用与本目录其它脚本一致的 SET @sql + PREPARE 幂等写法。
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aro_personnel' AND INDEX_NAME = 'idx_aro_open_id');
SET @sql = IF(@idx = 0,
    'ALTER TABLE aro_personnel ADD INDEX idx_aro_open_id (open_id)',
    'SELECT ''idx_aro_open_id already exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
