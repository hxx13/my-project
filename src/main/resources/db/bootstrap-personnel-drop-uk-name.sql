-- 姓名不再是身份键：删 uk_personnel_name（与 common/schema/V20260919__personnel_identity_keys.sql 同源）。
-- 幂等用 information_schema 守卫：裸 DROP INDEX 重跑报 1091「Can't DROP」，
-- 不命中小写白名单，会让每次启动多一条假 WARN、迁移阶段永久显示假失败。
SET @sql = (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND INDEX_NAME = 'uk_personnel_name'),
    'ALTER TABLE personnel DROP INDEX uk_personnel_name',
    'SELECT ''uk_personnel_name gone'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
