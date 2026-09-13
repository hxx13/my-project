-- 归档迁移：滞留检测浦东/浦西校区开关列（与 src/main/resources/db/bootstrap-stranded-config-campus-*.sql 同源）。
-- 启动链按「一文件一条 DDL」拆分执行；本归档文件可用多条，各自带 information_schema 守卫，重复执行为幂等。

SET @stmt_pd = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stranded_violation_config' AND COLUMN_NAME = 'campus_pd_enabled') = 0,
  'ALTER TABLE stranded_violation_config ADD COLUMN campus_pd_enabled TINYINT NOT NULL DEFAULT 1 COMMENT ''浦东校区参与滞留检测：1=开 0=关''',
  'SELECT 1'
));
PREPARE st FROM @stmt_pd;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @stmt_px = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stranded_violation_config' AND COLUMN_NAME = 'campus_px_enabled') = 0,
  'ALTER TABLE stranded_violation_config ADD COLUMN campus_px_enabled TINYINT NOT NULL DEFAULT 1 COMMENT ''浦西校区参与滞留检测：1=开 0=关''',
  'SELECT 1'
));
PREPARE st FROM @stmt_px;
EXECUTE st;
DEALLOCATE PREPARE st;
