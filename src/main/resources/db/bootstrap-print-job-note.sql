-- print_job 增加「备注」列：派发时写一句这打的是什么，工位旁边的人看得到。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'print_job' AND COLUMN_NAME = 'note') = 0,
  'ALTER TABLE print_job ADD COLUMN note VARCHAR(512) NULL COMMENT ''派发备注，随任务带到工位页''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
