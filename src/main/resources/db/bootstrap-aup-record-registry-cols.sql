-- ============================================================
-- aup_record 补齐计划文档 §6.1 设计的注册字段
-- 撤销独立注册表后，将独有字段并入计划书主表，
-- 保证「注册表里有的 aup_record 也有」，表结构按计划文档 §6.1 扩展。
-- 幂等：逐列判断 information_schema 后 ALTER。
-- 同源：common/schema/V20260818__aup_record_registry_cols.sql
-- ============================================================

-- ① 课题组外键 → project_group.id（关键枢纽）
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'project_group_id');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN project_group_id BIGINT NULL COMMENT ''课题组外键 → project_group.id''', 'SELECT ''project_group_id exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 动物类型白名单（结构化 JSON）
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'animal_allowlist');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN animal_allowlist JSON NULL COMMENT ''动物类型白名单（结构化）''', 'SELECT ''animal_allowlist exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ 有效期状态 active/expired（与 current_stage 流程状态互补）
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aup_record' AND COLUMN_NAME = 'status');
SET @sql = IF(@col = 0, 'ALTER TABLE aup_record ADD COLUMN status VARCHAR(16) NULL COMMENT ''active/expired（有效期状态）''', 'SELECT ''status exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
