-- 删除 person_identity.scope 列：身份标识统一一套、不分视角，key=staff_id。
-- 幂等：判存在后 DROP COLUMN（会自动删除引用 scope 的索引），再补回不含 scope 的唯一键。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'person_identity' AND COLUMN_NAME = 'scope');
SET @sql = IF(@col > 0, 'ALTER TABLE person_identity DROP COLUMN scope', 'SELECT ''scope not exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'person_identity' AND INDEX_NAME = 'uk_person_identity');
SET @sql = IF(@idx = 0, 'ALTER TABLE person_identity ADD UNIQUE KEY uk_person_identity (user_id, tag_id)', 'SELECT ''uk exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
