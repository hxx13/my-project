-- 目标库执行一次：交互验证完成后是否自动解锁禁入
SET @ddl := IF(
  (SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'interactive_unlock_on_verify') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''交互验证完成后是否自动解除禁入;1=是''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl2 := IF(
  (SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stranded_violation_config' AND COLUMN_NAME = 'interactive_unlock_on_verify') = 0,
  'ALTER TABLE stranded_violation_config ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''自动违规:交互验证完成后是否自动解除禁入''',
  'SELECT 1'
);
PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
