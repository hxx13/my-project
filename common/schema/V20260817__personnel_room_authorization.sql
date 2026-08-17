-- personnel 增加房间授权字段（与 aro_personnel 同步）。
-- 幂等：按 information_schema 判存在后再加列。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'allowed_rooms_display_zh');
SET @sql = IF(@col = 0, 'ALTER TABLE personnel ADD COLUMN allowed_rooms_display_zh VARCHAR(4000) NULL COMMENT ''官方可进房间可读列表（含校区）''', 'SELECT ''allowed_rooms_display_zh exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'has_official_room_permission');
SET @sql = IF(@col = 0, 'ALTER TABLE personnel ADD COLUMN has_official_room_permission TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1=有官方可进房间 0=无''', 'SELECT ''has_official_room_permission exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
