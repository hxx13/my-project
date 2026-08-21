-- 期 6 deepen：违规/公告五表 content_json 真源列（HTML 列保留为派生缓存）
-- 字段对应设计 A-4：violation_text / content_html / body_html×2 / content(模板表沿用 violation_text)
-- 1 twin_student_violation  2 twin_scan_popup_announcement  3 twin_violation_text_template
-- 4 mini_program_announcement  5 mini_program_release

SET @db := DATABASE();

-- 1
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_student_violation' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_student_violation ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER violation_text',
  'SELECT ''twin_student_violation.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_scan_popup_announcement' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_scan_popup_announcement ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER content_html',
  'SELECT ''twin_scan_popup_announcement.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'twin_violation_text_template' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE twin_violation_text_template ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER violation_text',
  'SELECT ''twin_violation_text_template.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'mini_program_announcement' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE mini_program_announcement ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER body_html',
  'SELECT ''mini_program_announcement.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'mini_program_release' AND COLUMN_NAME = 'content_json'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE mini_program_release ADD COLUMN content_json JSON NULL COMMENT ''ProseMirror/TipTap JSON 真源'' AFTER body_html',
  'SELECT ''mini_program_release.content_json exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
