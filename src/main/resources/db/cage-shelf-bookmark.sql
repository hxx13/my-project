DROP TABLE IF EXISTS cage_shelf_bookmark;
CREATE TABLE cage_shelf_bookmark (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    room_id BIGINT NOT NULL COMMENT '房间ID',
    shelve_id BIGINT NOT NULL COMMENT '笼架ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_room_shelve (user_id, room_id, shelve_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼架收藏表';
