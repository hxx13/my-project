-- 重命名 personnel.student_id → aro_user_id（与 common/schema/V20260817 同源）。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'student_id');
SET @sql = IF(@col > 0, 'ALTER TABLE personnel RENAME COLUMN student_id TO aro_user_id', 'SELECT ''student_id not exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
