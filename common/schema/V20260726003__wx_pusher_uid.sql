-- ============================================================
-- WxPusher 推送渠道：user/aro_personnel 表加 wx_pusher_uid 列
-- ============================================================

-- sys_user
SET @col1 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'wx_pusher_uid');
SET @sql1 = IF(@col1 = 0,
    'ALTER TABLE sys_user ADD COLUMN wx_pusher_uid VARCHAR(128) DEFAULT NULL COMMENT ''WxPusher用户UID''',
    'SELECT ''column wx_pusher_uid already exists in sys_user''');
PREPARE stmt FROM @sql1;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- aro_personnel
SET @col2 = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aro_personnel' AND COLUMN_NAME = 'wx_pusher_uid');
SET @sql2 = IF(@col2 = 0,
    'ALTER TABLE aro_personnel ADD COLUMN wx_pusher_uid VARCHAR(128) DEFAULT NULL COMMENT ''WxPusher用户UID''',
    'SELECT ''column wx_pusher_uid already exists in aro_personnel''');
PREPARE stmt FROM @sql2;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
