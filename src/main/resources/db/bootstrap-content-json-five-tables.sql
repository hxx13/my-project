-- 与 common/schema/V20260821006__content_json_five_tables.sql 对齐（幂等）

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER violation_text',
  'SELECT ''twin_student_violation.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_scan_popup_announcement' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_scan_popup_announcement ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER content_html',
  'SELECT ''twin_scan_popup_announcement.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_violation_text_template' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_violation_text_template ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER violation_text',
  'SELECT ''twin_violation_text_template.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'mini_program_announcement' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE mini_program_announcement ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER body_html',
  'SELECT ''mini_program_announcement.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'mini_program_release' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE mini_program_release ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER body_html',
  'SELECT ''mini_program_release.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
