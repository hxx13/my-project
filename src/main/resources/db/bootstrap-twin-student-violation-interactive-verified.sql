-- 交互拼图永久确认时间；非 NULL 表示已完成交互验证并永久解除禁入
SET @ddl := IF(
  (SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'interactive_challenge_verified_at') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge_verified_at DATETIME NULL COMMENT ''交互拼图完成时间;非NULL=已永久解除禁入''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
