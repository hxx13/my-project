-- 归档迁移：违规公告展示时间与独立解除（与 src/main/resources/db/bootstrap-violation-notice-*.sql 同源）。
-- 四条各自带 information_schema 守卫，可重复执行。

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_display_days') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_display_days INT NULL COMMENT ''公告展示天数；NULL=跟随到期时间''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_link_expire') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_link_expire TINYINT NOT NULL DEFAULT 1 COMMENT ''公告展示是否与到期时间联动：1=展示到到期时间 0=按展示天数''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_cleared_at') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_cleared_at DATETIME NULL COMMENT ''公告被单独解除的时间；非空即公告下板''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'notice_cleared_by_user_id') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN notice_cleared_by_user_id VARCHAR(64) NULL COMMENT ''解除公告的操作人''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
