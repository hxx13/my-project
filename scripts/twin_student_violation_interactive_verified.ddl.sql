-- 目标库（默认 twin_system）执行一次：交互验证永久确认列
-- 与 src/main/resources/db/bootstrap-twin-student-violation-interactive-verified.sql 一致

SET @ddl := IF(
  (SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'interactive_challenge_verified_at') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge_verified_at DATETIME NULL COMMENT ''交互拼图完成时间;非NULL=已永久解除禁入''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
