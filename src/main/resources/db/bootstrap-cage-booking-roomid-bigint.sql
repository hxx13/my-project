-- 幂等：仅当 room_id 仍是 varchar 时才改为 BIGINT，避免重复执行报错
SET @is_varchar = (
  SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cage_booking_room'
    AND COLUMN_NAME = 'room_id' AND DATA_TYPE = 'varchar'
);
SET @sql = IF(@is_varchar > 0,
  'ALTER TABLE cage_booking_room MODIFY room_id BIGINT NOT NULL COMMENT ''房间ID（本地统一数值口径）''',
  'SELECT ''room_id already bigint''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @is_varchar2 = (
  SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cage_booking_room_aup'
    AND COLUMN_NAME = 'room_id' AND DATA_TYPE = 'varchar'
);
SET @sql2 = IF(@is_varchar2 > 0,
  'ALTER TABLE cage_booking_room_aup MODIFY room_id BIGINT NULL COMMENT ''所属房间（本地统一数值口径）''',
  'SELECT ''aup.room_id already bigint''');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
