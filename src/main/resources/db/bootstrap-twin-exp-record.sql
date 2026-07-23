CREATE TABLE IF NOT EXISTS twin_exp_record (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL COMMENT '用户ID',
    user_name VARCHAR(128) DEFAULT NULL COMMENT '用户姓名（冗余，便于统计查询）',
    exp_amount INT NOT NULL DEFAULT 0 COMMENT '经验值数量',
    source_type VARCHAR(32) NOT NULL COMMENT '来源: FIRST_ENTRY / TIME_BASED',
    access_type TINYINT NOT NULL COMMENT '1=进入 2=离开',
    room_id VARCHAR(64) DEFAULT NULL COMMENT '房间ID',
    room_name VARCHAR(128) DEFAULT NULL COMMENT '房间名称（冗余）',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_er_user_id (user_id),
    INDEX idx_er_create_time (create_time),
    INDEX idx_er_source_type (source_type),
    INDEX idx_er_user_date (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='经验值流水记录';
