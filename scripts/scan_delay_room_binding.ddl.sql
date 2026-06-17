-- 房间与延迟选项搭配（选项库见 twin_scan_delay_option）
-- 目标库见 application.properties（默认 twin_system）

CREATE TABLE IF NOT EXISTS twin_scan_delay_room_option (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL COMMENT 'ARO 房间 ID',
    option_id BIGINT NOT NULL COMMENT 'twin_scan_delay_option.id',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sdro_room_option (room_id, option_id),
    KEY idx_sdro_room (room_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间与延迟选项搭配';

-- 从旧版 option.room_id 迁移（若搭配表为空）：
-- INSERT IGNORE INTO twin_scan_delay_room_option (room_id, option_id, sort_order)
-- SELECT room_id, id, sort_order FROM twin_scan_delay_option WHERE TRIM(room_id) <> '';
