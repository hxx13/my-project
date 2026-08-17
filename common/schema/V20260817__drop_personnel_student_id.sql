-- 重命名 personnel.student_id → aro_user_id。
-- 模型收敛：该列存的是 ARO 唯一认证 id（aro_personnel.user_id，学生视角索引，字母数字混合），
-- 不是「学号」；学号 = 工号 = job_number。故改名 aro_user_id，保留双 id（staff_id + aro_user_id）。
-- 幂等：按 information_schema 判存在后再 RENAME。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'student_id');
SET @sql = IF(@col > 0, 'ALTER TABLE personnel RENAME COLUMN student_id TO aro_user_id', 'SELECT ''student_id not exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
