-- personnel 增加房间授权字段（与 common/schema/V20260817 同源，幂等）。
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'allowed_rooms_display_zh');
SET @sql = IF(@col = 0, 'ALTER TABLE personnel ADD COLUMN allowed_rooms_display_zh VARCHAR(4000) NULL COMMENT ''官方可进房间可读列表（含校区）''', 'SELECT ''allowed_rooms_display_zh exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personnel' AND COLUMN_NAME = 'has_official_room_permission');
SET @sql = IF(@col = 0, 'ALTER TABLE personnel ADD COLUMN has_official_room_permission TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1=有官方可进房间 0=无''', 'SELECT ''has_official_room_permission exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 本地「人→房间」授权覆盖层（与 common/schema/V20260907 同源，幂等）。
CREATE TABLE IF NOT EXISTS personnel_room_authorization (
  aro_user_id  VARCHAR(64) NOT NULL COMMENT 'ARO 19 位认证 id（aro_personnel.user_id）',
  room_id      VARCHAR(64) NOT NULL COMMENT '官方房间 id（room_mapping_room.room_id）',
  updated_at   DATETIME NULL,
  updated_by   VARCHAR(64) NULL,
  PRIMARY KEY (aro_user_id, room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本地人→房间授权覆盖层';

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'aro_personnel' AND COLUMN_NAME = 'room_auth_managed');
SET @sql = IF(@col = 0, 'ALTER TABLE aro_personnel ADD COLUMN room_auth_managed TINYINT NOT NULL DEFAULT 0 COMMENT ''0=ARO管理 1=本地管理''', 'SELECT ''room_auth_managed exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
