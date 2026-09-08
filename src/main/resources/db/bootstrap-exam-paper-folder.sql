-- 试卷文件夹分类（与 common/schema/V20260908__exam_paper_folder.sql 同源）。
-- 幂等：重复执行时表/列已存在即跳过。

CREATE TABLE IF NOT EXISTS exam_paper_folder (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  created_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db = DATABASE();

SET @sql = (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'exam_paper' AND COLUMN_NAME = 'folder_id'
    ),
    'SELECT ''exam_paper.folder_id exists''',
    'ALTER TABLE exam_paper ADD COLUMN folder_id BIGINT NULL COMMENT ''归属文件夹 FK→exam_paper_folder.id；NULL=未分类'''
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
