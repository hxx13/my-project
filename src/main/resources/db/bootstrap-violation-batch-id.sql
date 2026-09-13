-- 一次下发的批次键：同一次 createBatch / 同一次滞留检测运行共用同一个值（幂等：先查列是否存在再 ALTER）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'batch_id') = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN batch_id VARCHAR(64) NULL COMMENT ''一次下发的批次键；NULL=历史数据（按 id 自成一批）''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
