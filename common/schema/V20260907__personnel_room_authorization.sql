CREATE TABLE IF NOT EXISTS personnel_room_authorization (
  aro_user_id  VARCHAR(64) NOT NULL COMMENT 'ARO 19 位认证 id（aro_personnel.user_id）',
  room_id      VARCHAR(64) NOT NULL COMMENT '官方房间 id（room_mapping_room.room_id）',
  updated_at   DATETIME NULL,
  updated_by   VARCHAR(64) NULL,
  PRIMARY KEY (aro_user_id, room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本地人→房间授权覆盖层';

SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aro_personnel' AND COLUMN_NAME='room_auth_managed');
SET @s = IF(@c=0, 'ALTER TABLE aro_personnel ADD COLUMN room_auth_managed TINYINT NOT NULL DEFAULT 0 COMMENT ''0=ARO管理 1=本地管理''', 'SELECT ''exists''');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
