-- 批次键索引（独立文件：一个 bootstrap 文件只能有一条 DDL，多条会被前一条的 benign 失败整段跳过）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND INDEX_NAME = 'idx_violation_batch') = 0,
  'ALTER TABLE twin_student_violation ADD INDEX idx_violation_batch (batch_id)',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
