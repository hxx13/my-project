SET @ddl := IF(
  (SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'interactive_unlock_on_verify') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''交互验证完成后是否自动解除禁入;1=是''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
