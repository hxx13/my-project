-- print_job 增加「优先级」列：数值大的先被工位领走，同值按先进先出。
-- 默认 0 = 普通；加急给个正数即可，不用枚举。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_job' AND COLUMN_NAME = 'priority') = 0,
  'ALTER TABLE print_job ADD COLUMN priority INT NOT NULL DEFAULT 0 COMMENT ''越大越先被领取；0=普通，10=加急''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
