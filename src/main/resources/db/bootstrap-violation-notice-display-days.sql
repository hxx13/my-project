-- 公告展示天数：NULL = 跟随到期时间（幂等：先查列是否存在再 ALTER）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_display_days') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_display_days INT NULL COMMENT ''公告展示天数；NULL=跟随到期时间''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
