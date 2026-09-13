-- 公告展示是否与到期时间联动（幂等：先查列是否存在再 ALTER）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_link_expire') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_link_expire TINYINT NOT NULL DEFAULT 1 COMMENT ''公告展示是否与到期时间联动：1=展示到到期时间 0=按展示天数''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
