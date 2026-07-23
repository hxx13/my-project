ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS account_source VARCHAR(16) DEFAULT NULL COMMENT '账号来源库: STUDENT | STAFF';

-- Backfill existing accounts by role
UPDATE sys_user SET account_source = 'STUDENT' WHERE role = 'MEMBER' AND account_source IS NULL;
UPDATE sys_user SET account_source = 'STAFF' WHERE role IN ('STAFF', 'SENIOR', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_OWNER') AND account_source IS NULL;
