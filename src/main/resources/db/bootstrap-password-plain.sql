-- Add password_plain column for AES-encrypted plaintext (admin password viewing)
-- Idempotent: skips if column already exists
SET @pp_exists := (SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'password_plain');
SET @pp_sql := IF(@pp_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN password_plain VARCHAR(512) NULL COMMENT ''AES-256-GCM encrypted plaintext password for admin viewing''',
    'SELECT 1');
PREPARE stmt_pp FROM @pp_sql;
EXECUTE stmt_pp;
DEALLOCATE PREPARE stmt_pp;
