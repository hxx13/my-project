SET @ddl := IF(
  (SELECT COUNT(1) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stranded_violation_config' AND COLUMN_NAME = 'interactive_unlock_on_verify') = 0,
  'ALTER TABLE stranded_violation_config ADD COLUMN interactive_unlock_on_verify TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''自动违规:交互验证完成后是否自动解除禁入''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
