-- 培训系列：学习视频多选绑定（JSON 数组，如 [1,2,3]）。
-- 幂等：先查列是否存在再 ALTER。
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'training' AND COLUMN_NAME = 'video_ids_json') = 0,
  'ALTER TABLE training ADD COLUMN video_ids_json TEXT NULL COMMENT ''绑定学习视频 id JSON 数组''',
  'SELECT 1'
));
PREPARE st FROM @stmt;
EXECUTE st;
DEALLOCATE PREPARE st;
