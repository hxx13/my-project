-- =============================================================
-- AUP 码表整表版本（幂等）——启动自动执行
-- 同源：common/schema/V20260824011__aup_codelist_version.sql
-- =============================================================

SET @db := DATABASE();

-- 1) dict 加列（逐列探测，避免启动重复执行时中断后续语句）
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='version');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN version INT NOT NULL DEFAULT 1 COMMENT ''整表版本，同 dict_key 多行'' AFTER category', 'SELECT ''dict.version exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='status');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT ''DRAFT'' COMMENT ''DRAFT/PENDING_REVIEW/PUBLISHED/ARCHIVED'' AFTER version', 'SELECT ''dict.status exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='folder_id');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN folder_id BIGINT NULL COMMENT ''FK→aup_folder(owner_type=CODELIST)；NULL=未分类'' AFTER status', 'SELECT ''dict.folder_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='published_at');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN published_at DATETIME NULL COMMENT ''发布冻结时间'' AFTER folder_id', 'SELECT ''dict.published_at exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='published_by');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN published_by VARCHAR(64) NULL COMMENT ''发布人'' AFTER published_at', 'SELECT ''dict.published_by exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict' AND COLUMN_NAME='review_comment');
SET @sql = IF(@c=0, 'ALTER TABLE dict ADD COLUMN review_comment VARCHAR(512) NULL COMMENT ''最近一次驳回/通过意见'' AFTER published_by', 'SELECT ''dict.review_comment exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) dict_item 加逐项校对四态
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict_item' AND COLUMN_NAME='verdict');
SET @sql = IF(@c=0, 'ALTER TABLE dict_item ADD COLUMN verdict VARCHAR(16) NULL COMMENT ''CONFIRM/MODIFY/DELETE/QUESTION'' AFTER sort_order', 'SELECT ''dict_item.verdict exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='dict_item' AND COLUMN_NAME='verdict_note');
SET @sql = IF(@c=0, 'ALTER TABLE dict_item ADD COLUMN verdict_note VARCHAR(255) NULL COMMENT ''校对意见'' AFTER verdict', 'SELECT ''dict_item.verdict_note exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 存量回填：历史 dict 一律视为已发布 v1
UPDATE dict SET status = 'PUBLISHED', published_at = COALESCE(published_at, updated_at) WHERE status IS NULL OR status = 'DRAFT';

-- 4) 回填 folder_id（category → aup_folder）
UPDATE dict d
LEFT JOIN aup_folder f ON f.owner_type = 'CODELIST' AND f.parent_id = 0 AND f.name = d.category
SET d.folder_id = f.id
WHERE d.folder_id IS NULL AND d.category IS NOT NULL AND TRIM(d.category) <> '';

-- 5) 换唯一键：uk_dict_key(dict_key) → (dict_key, version)
SET @uk_old := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'dict' AND INDEX_NAME = 'uk_dict_key'
);
SET @sql = IF(@uk_old > 0,
  'ALTER TABLE dict DROP INDEX uk_dict_key',
  'SELECT ''uk_dict_key already dropped''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk_new := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'dict' AND INDEX_NAME = 'uk_dict_key_version'
);
SET @sql = IF(@uk_new = 0,
  'ALTER TABLE dict ADD UNIQUE KEY uk_dict_key_version (dict_key, version)',
  'SELECT ''uk_dict_key_version already present''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'dict' AND INDEX_NAME = 'idx_dict_folder'
);
SET @sql = IF(@fk = 0,
  'ALTER TABLE dict ADD KEY idx_dict_folder (folder_id)',
  'SELECT ''idx_dict_folder already present''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
