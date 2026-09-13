-- 处置提交次数（答题重试上限用）：每提交一次计数，成功或失败都算（幂等：先查列是否存在再 ALTER）
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'twin_obligation' AND COLUMN_NAME = 'attempt_count') = 0,
  'ALTER TABLE twin_obligation ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 COMMENT ''已提交处置次数（含失败）；答题重试上限据此判定''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
