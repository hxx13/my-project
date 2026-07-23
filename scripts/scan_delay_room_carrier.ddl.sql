-- 房间搭配改为绑定载体（非逐条二级菜单）；目标库 twin_system

CREATE TABLE IF NOT EXISTS twin_scan_delay_room_carrier (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL COMMENT 'ARO 房间 ID',
    carrier_id BIGINT NOT NULL COMMENT 'twin_scan_delay_carrier.id',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sdrc_room_carrier (room_id, carrier_id),
    KEY idx_sdrc_room (room_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间与延迟载体搭配';

-- 从旧 room_option 推断载体（幂等）
INSERT IGNORE INTO twin_scan_delay_room_carrier (room_id, carrier_id, sort_order)
SELECT DISTINCT ro.room_id, o.carrier_id, 0
FROM twin_scan_delay_room_option ro
INNER JOIN twin_scan_delay_option o ON o.id = ro.option_id
WHERE o.carrier_id IS NOT NULL;
