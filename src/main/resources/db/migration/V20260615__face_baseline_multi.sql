-- V20260615__face_baseline_multi.sql
-- face_baseline 改为支持同一人员多张底库照片（幂等，兼容 MySQL 5.7+）

SET @drop_uk := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'face_baseline'
      AND index_name = 'uk_user_id'
);
SET @drop_uk_sql := IF(
    @drop_uk > 0,
    'ALTER TABLE face_baseline DROP INDEX uk_user_id',
    'SELECT 1'
);
PREPARE drop_uk_stmt FROM @drop_uk_sql;
EXECUTE drop_uk_stmt;
DEALLOCATE PREPARE drop_uk_stmt;

SET @add_idx := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'face_baseline'
      AND index_name = 'idx_user_id'
);
SET @add_idx_sql := IF(
    @add_idx = 0,
    'ALTER TABLE face_baseline ADD INDEX idx_user_id (user_id)',
    'SELECT 1'
);
PREPARE add_idx_stmt FROM @add_idx_sql;
EXECUTE add_idx_stmt;
DEALLOCATE PREPARE add_idx_stmt;
