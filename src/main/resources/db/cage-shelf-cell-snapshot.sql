CREATE TABLE IF NOT EXISTS cage_shelf_cell_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scan_batch_id VARCHAR(32) NOT NULL COMMENT '扫描批次',
    room_id BIGINT NOT NULL COMMENT '房间ID',
    shelve_id BIGINT NOT NULL COMMENT '笼架ID',
    position_x INT NOT NULL COMMENT '横向位置 1-8',
    position_y INT NOT NULL COMMENT '纵向位置 1-10',
    position_label VARCHAR(16) NOT NULL COMMENT 'A-1 到 H-10',
    animal_cage_type INT COMMENT '笼位状态: 1等待分配 2已预约空笼盒 3已预约饲养中 4异常',
    cage_box_json TEXT COMMENT '完整笼盒信息JSON',
    special_statuses_json TEXT COMMENT '特殊状态JSON',
    scanned_at DATETIME NOT NULL COMMENT '扫描时间',
    INDEX idx_room_shelve_batch (room_id, shelve_id, scan_batch_id),
    INDEX idx_batch (scan_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位快照表（每笼位一行，每周全量扫描）';
