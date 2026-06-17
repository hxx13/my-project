-- face_baseline 一人多张：移除 uk_user_id 唯一约束
-- 目标库：twin_system（见 application.properties spring.datasource.url）
-- 本地/运维：在应用启动前或录入报错时执行本脚本一次即可（幂等）

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
