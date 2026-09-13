-- 归档迁移：违规批次键（与 src/main/resources/db/bootstrap-violation-batch-id*.sql 同源）。
-- 两条各自带 information_schema 守卫，可重复执行。

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'batch_id') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN batch_id VARCHAR(64) NULL COMMENT ''一次下发的批次键；NULL=历史数据（按 id 自成一批）''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND INDEX_NAME = 'idx_violation_batch') = 0,
  'ALTER TABLE twin_student_violation ADD INDEX idx_violation_batch (batch_id)',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
