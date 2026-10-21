-- 打印任务入队序号：created_at 只有秒级精度，同一秒批量建单时先后不可区分，
-- 领取/队列展示会出现随机甚至倒序。用自增序列做稳定的先进先出顺序。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_job' AND COLUMN_NAME = 'seq') = 0,
  'ALTER TABLE print_job ADD COLUMN seq BIGINT NOT NULL AUTO_INCREMENT UNIQUE COMMENT ''入队顺序号''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
