-- 笼位事件日志：追踪笼盒移动、类型变更、特殊状态变化、归属变更等所有生命周期事件
CREATE TABLE IF NOT EXISTS cage_event_log (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    scan_batch_id    VARCHAR(64)   NOT NULL COMMENT '触发此事件的扫描批次',
    event_type       VARCHAR(24)   NOT NULL COMMENT 'BOX_ARRIVED|BOX_DEPARTED|BOX_MOVED|TYPE_CHANGED|STATUS_ADDED|STATUS_REMOVED|STATUS_CHANGED|PI_CHANGED|DEPT_CHANGED',

    -- 笼盒锚点（cageBoxQrCode 是笼盒唯一标识）
    cage_box_qr_code VARCHAR(64)   COMMENT '笼盒卡号',

    -- 位置 — 变更前
    prev_shelve_id   VARCHAR(64)   COMMENT '变更前笼架ID',
    prev_position    VARCHAR(16)   COMMENT '变更前位置标签(如 A-3)',
    prev_campus_name VARCHAR(64)   COMMENT '变更前校区',
    prev_room_name   VARCHAR(64)   COMMENT '变更前房间',

    -- 位置 — 变更后
    curr_shelve_id   VARCHAR(64)   COMMENT '变更后笼架ID',
    curr_position    VARCHAR(16)   COMMENT '变更后位置标签',
    curr_campus_name VARCHAR(64)   COMMENT '变更后校区',
    curr_room_name   VARCHAR(64)   COMMENT '变更后房间',

    -- 变更详情（JSON，结构随 event_type 不同）
    prev_value_json  TEXT          COMMENT '变更前数据快照 JSON',
    curr_value_json  TEXT          COMMENT '变更后数据快照 JSON',

    -- 人类可读摘要
    detail_summary   VARCHAR(512)  COMMENT '可读摘要：笼盒 X 从 浦东201-A3 移至 浦西302-B7',

    -- 归属信息（快照时的课题组/PI/部门）
    pi_name          VARCHAR(64),
    project_pi_name  VARCHAR(64),
    department_name  VARCHAR(128),

    changed_at       DATETIME      NOT NULL COMMENT '事件时间',

    INDEX idx_box     (cage_box_qr_code),
    INDEX idx_batch   (scan_batch_id),
    INDEX idx_type    (event_type, changed_at),
    INDEX idx_pos_curr (curr_shelve_id, curr_position),
    INDEX idx_pos_prev (prev_shelve_id, prev_position),
    INDEX idx_pi      (project_pi_name),
    INDEX idx_time    (changed_at),
    INDEX idx_campus  (curr_campus_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位全生命周期事件日志';
