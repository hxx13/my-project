-- 期 6：ProseMirror JSON 真源列；既有 content_html 降级为派生缓存

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_obligation' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_obligation ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER content_html',
  'SELECT ''content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_obligation' AND COLUMN_NAME = 'require_reconfirm'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_obligation ADD COLUMN require_reconfirm TINYINT NOT NULL DEFAULT 0 COMMENT ''内容变更后需重新确认'' AFTER disposition_config_json',
  'SELECT ''require_reconfirm exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
