-- 解除公告的操作人（幂等：先查列是否存在再 ALTER）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_cleared_by_user_id') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_cleared_by_user_id VARCHAR(64) NULL COMMENT ''解除公告的操作人''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
