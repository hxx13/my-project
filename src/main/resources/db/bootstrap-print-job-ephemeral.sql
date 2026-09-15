-- print_job 增加「临时任务」标记：临时打印产生的任务只有发起人自己看得到。
-- 0 = 普通任务，所有人可见；1 = 临时任务，仅 created_by 本人可见。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_job' AND COLUMN_NAME = 'ephemeral') = 0,
  'ALTER TABLE print_job ADD COLUMN ephemeral TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1=临时任务，仅发起人可见''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
