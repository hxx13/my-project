-- ============================================================
-- aup_record 补齐 aup_registry 设计字段（计划文档 §6.1）
-- 撤销独立 aup_registry 表后，将注册表独有字段并入计划书主表。
-- 同源：src/main/resources/db/bootstrap-aup-record-registry-cols.sql
-- ============================================================

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'project_group_id');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN project_group_id BIGINT NULL COMMENT ''课题组外键 → project_group.id''', 'SELECT ''project_group_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'animal_allowlist');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN animal_allowlist JSON NULL COMMENT ''动物类型白名单（结构化）''', 'SELECT ''animal_allowlist exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'status');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN status VARCHAR(16) NULL COMMENT ''active/expired（有效期状态）''', 'SELECT ''status exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
