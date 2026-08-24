-- =============================================================
-- AUP 码表外部引用头标记（幂等）——启动自动执行
-- 同源：common/schema/V20260824016__aup_dict_source.sql
-- =============================================================

SET @db := DATABASE();

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='source');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT ''LOCAL'' COMMENT ''LOCAL/EXTERNAL'' AFTER review_comment', 'SELECT ''dict.source exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='source_ref');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN source_ref VARCHAR(64) NULL COMMENT ''projectGroup/ANIMAL_BREED/ANIMAL_STRAIN'' AFTER source', 'SELECT ''dict.source_ref exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
