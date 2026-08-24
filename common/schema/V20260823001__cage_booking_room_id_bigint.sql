-- 笼位预约房间 id 归一为 BIGINT，与 cage_shelf_index.room_id 同口径（本地唯一数值房间编号）
ALTER TABLE cage_booking_room MODIFY room_id BIGINT NOT NULL COMMENT '房间ID（本地统一数值口径）';
ALTER TABLE cage_booking_room_aup MODIFY room_id BIGINT NULL COMMENT '所属房间（本地统一数值口径）';
