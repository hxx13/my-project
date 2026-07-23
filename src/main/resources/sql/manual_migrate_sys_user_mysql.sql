-- 一次性在「当前库」补齐 sys_user 与 UserMapper 对齐的列（idempotent）。
-- 用法：在 MySQL 客户端中先 USE your_database; 再 SOURCE 本文件，或整段粘贴执行。
-- 说明：应用配置 spring.sql.init.mode=never，不会自动执行 schema.sql，历史库需手动跑本脚本或下方等价语句。

-- 兼容老表无 status
SET @status_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'status'
);
SET @status_sql := IF(
    @status_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT ''账号状态:1启用,0禁用''',
    'SELECT 1'
);
PREPARE stmt_status FROM @status_sql;
EXECUTE stmt_status;
DEALLOCATE PREPARE stmt_status;

SET @pwd_reset_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'password_reset_required'
);
SET @pwd_reset_sql := IF(
    @pwd_reset_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN password_reset_required TINYINT NOT NULL DEFAULT 0 COMMENT ''是否需在个人中心改密:1是,0否''',
    'SELECT 1'
);
PREPARE stmt_pwd_reset FROM @pwd_reset_sql;
EXECUTE stmt_pwd_reset;
DEALLOCATE PREPARE stmt_pwd_reset;

SET @nick_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'display_nickname'
);
SET @nick_sql := IF(
    @nick_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN display_nickname VARCHAR(64) NULL COMMENT ''展示昵称（无人员库姓名时用于报修/采购/物资等申请人展示）''',
    'SELECT 1'
);
PREPARE stmt_nick FROM @nick_sql;
EXECUTE stmt_nick;
DEALLOCATE PREPARE stmt_nick;

SET @mbt_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'mini_bind_type'
);
SET @mbt_sql := IF(
    @mbt_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN mini_bind_type VARCHAR(16) NULL COMMENT ''微信小程序绑定方式:STUDENT|STAFF''',
    'SELECT 1'
);
PREPARE stmt_mbt FROM @mbt_sql;
EXECUTE stmt_mbt;
DEALLOCATE PREPARE stmt_mbt;

SET @mpref_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'mini_preferences_json'
);
SET @mpref_sql := IF(
    @mpref_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN mini_preferences_json LONGTEXT NULL COMMENT ''小程序个人配置JSON（房间关注区域等）''',
    'SELECT 1'
);
PREPARE stmt_mpref FROM @mpref_sql;
EXECUTE stmt_mpref;
DEALLOCATE PREPARE stmt_mpref;
