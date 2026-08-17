CREATE TABLE IF NOT EXISTS scan_occupancy_state (
    user_id VARCHAR(64) NOT NULL COMMENT '主键，ARO 19 位认证 id',
    state VARCHAR(16) NOT NULL COMMENT 'INSIDE / OUTSIDE',
    current_room_id VARCHAR(64) NULL COMMENT '当前在馆房间 id（单房间）',
    current_room_name VARCHAR(256) NULL COMMENT '当前房间名（冗余展示）',
    enter_log_id VARCHAR(64) NULL COMMENT '最近一次本地 enter 流水 id',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码进出本地状态机（一人一行当前状态）';
