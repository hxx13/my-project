-- 新增交互式违规确认字段（幂等：先检测列是否存在再添加）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'interactive_challenge') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN interactive_challenge VARCHAR(128) NULL COMMENT ''交互确认短语;null=普通公告''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
