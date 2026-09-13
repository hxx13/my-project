-- 公告被单独解除的时间（与违规/禁入解除无关，幂等：先查列是否存在再 ALTER）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_cleared_at') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_cleared_at DATETIME NULL COMMENT ''公告被单独解除的时间；非空即公告下板''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
