-- 登录安全：账号锁定（幂等，重复执行安全）
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS login_fail_count INT NOT NULL DEFAULT 0;
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS login_locked_until DATETIME NULL;
