-- 滞留检测：浦东校区开关（幂等）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stranded_violation_config' AND COLUMN_NAME = 'campus_pd_enabled') = 0,
  'ALTER TABLE stranded_violation_config ADD COLUMN campus_pd_enabled TINYINT NOT NULL DEFAULT 1 COMMENT ''浦东校区参与滞留检测：1=开 0=关''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
