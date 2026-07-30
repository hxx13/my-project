-- AGV 行为分析系统：空间语义 + 活动规则 + 标注结果 + 人工纠正

CREATE TABLE IF NOT EXISTS agv_spatial_element (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL COMMENT '用户命名',
    map_name        VARCHAR(32)  NULL,
    element_type    VARCHAR(20)  NOT NULL COMMENT 'STATION_ZONE|POLYGON_ZONE|POI|STATION_PATTERN',
    station_pattern VARCHAR(64)  NULL COMMENT '如 LM1199 或 LM11*',
    polygon_json    TEXT         NULL COMMENT '[{x,y}...]',
    poi_x           DOUBLE       NULL,
    poi_y           DOUBLE       NULL,
    poi_radius_m    DOUBLE       NULL DEFAULT 1.0,
    semantic_tags   JSON         NULL COMMENT '["充电","作业","通道","等待"]',
    color           VARCHAR(8)   NULL DEFAULT '#3b82f6',
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_spatial_map (map_name),
    INDEX idx_spatial_type (element_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV空间语义元素';

CREATE TABLE IF NOT EXISTS agv_activity_rule (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL COMMENT '规则名称',
    activity_type   VARCHAR(32)  NOT NULL COMMENT 'activity_type枚举值',
    spatial_cond    JSON         NULL COMMENT '{"zone_tags":["充电"],"station_regex":"CP.*"}',
    primitive_cond  JSON         NULL COMMENT '["MOVE_END","ENTER_ZONE"]',
    state_cond      JSON         NULL COMMENT '{"charging":true,"task_status":4,"di_7":true}',
    min_duration_sec INT         NULL DEFAULT 0,
    max_duration_sec INT         NULL,
    priority        INT          NOT NULL DEFAULT 5,
    confidence_base DOUBLE       NOT NULL DEFAULT 0.8,
    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV活动标注规则';

CREATE TABLE IF NOT EXISTS agv_activity_segment (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    robot_ip        VARCHAR(20)  NOT NULL,
    start_time      DATETIME(3)  NOT NULL,
    end_time        DATETIME(3)  NOT NULL,
    activity_type   VARCHAR(32)  NOT NULL,
    zone_id         BIGINT       NULL,
    start_x         DOUBLE       NULL,
    start_y         DOUBLE       NULL,
    end_x           DOUBLE       NULL,
    end_y           DOUBLE       NULL,
    avg_x           DOUBLE       NULL,
    avg_y           DOUBLE       NULL,
    distance_m      DOUBLE       NULL,
    battery_delta   DOUBLE       NULL,
    source          VARCHAR(16)  NOT NULL DEFAULT 'AUTO' COMMENT 'AUTO|MANUAL|CORRECTED',
    confidence      DOUBLE       NOT NULL DEFAULT 0.5,
    rule_id         BIGINT       NULL,
    correction_id   BIGINT       NULL,
    metadata_json   JSON         NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_seg_robot_time (robot_ip, start_time),
    INDEX idx_seg_type (activity_type),
    INDEX idx_seg_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV活动段标注结果';

CREATE TABLE IF NOT EXISTS agv_correction (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    segment_id          BIGINT       NOT NULL,
    original_type       VARCHAR(32)  NOT NULL,
    corrected_type      VARCHAR(32)  NOT NULL,
    corrected_by        VARCHAR(32)  NOT NULL,
    correction_note     VARCHAR(256) NULL,
    coordinate_snapshot JSON         NULL,
    feedback_applied    TINYINT(1)   NOT NULL DEFAULT 0,
    applied_rule_id     BIGINT       NULL,
    corrected_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_corr_segment (segment_id),
    INDEX idx_corr_feedback (feedback_applied)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV活动标注人工纠正记录';

-- Clean up ALL old rules (including duplicates from previous INSERT IGNORE), then insert presets
DELETE FROM agv_activity_rule;

-- Preset rules (14 rules) — spatial_cond 只用于细分场景，不加在基础发现规则上
INSERT INTO agv_activity_rule (name, activity_type, spatial_cond, primitive_cond, state_cond, min_duration_sec, max_duration_sec, priority, confidence_base) VALUES
-- 基础发现规则（无 spatial_cond，任何位置都能触发 → 后续由 spatialZoneDiscovery 聚类发现区域）
('充电',          'CHARGING',          NULL,                                    '["CHARGING_START"]',              '{"charging":true,"task_status":4}',               30, NULL, 10, 0.95),
('站点作业',      'STATION_WORK',      NULL,                                    '["FORK_RAISE","FORK_LOWER"]',     '{"task_status":4}',                               5,  600,  8, 0.90),
-- 细分场景规则（有 spatial_cond，只在已标记区域内触发精分类）
('站点停靠',      'STATION_DWELL',     '{"zone_tags":["作业"]}',                '["MOVE_END","SPIN","REVERSE","CREEP"]', '{"task_status":4}',                      3,  600,  5, 0.70),
('运输中',        'TRANSPORT',         NULL,                                    '["MOVE_START"]',                  '{"task_status":2,"charging":false,"fork_height_min":0.001}',   3, NULL,  6, 0.90),
('寻路中',        'NAVIGATING',        NULL,                                    '["MOVE_START"]',                  '{"task_status":2,"charging":false,"fork_height_max":0.001}',   3, NULL,  5, 0.85),
('路径等待',      'PATH_WAIT',         NULL,                                    '["MOVE_END"]',                    '{"task_status":4}',                                0,    5,  3, 0.70),
('货叉操作',      'FORK_OPERATION',    NULL,                                    '["FORK_RAISE","FORK_LOWER"]',     '{"task_status":4}',                               1,   30,  8, 0.90),
('倒车调头',      'REVERSE_MANEUVER',  NULL,                                    '["REVERSE"]',                     NULL,                                             NULL, NULL,  6, 0.80),
('重定位事件',    'RELOC_EVENT',       NULL,                                    '["RELOC"]',                       NULL,                                             NULL, NULL,  2, 0.95),
('急停',          'EMERGENCY_STOP',    NULL,                                    '["EMERGENCY_ON"]',                '{"emergency":true}',                            NULL, NULL, 10, 1.00),
('受阻等待',      'BLOCKED_WAIT',      NULL,                                    '["BLOCKED_ON"]',                  '{"blocked":true}',                              NULL, NULL,  9, 0.95),
('充电完成',      'CHARGING_COMPLETE', NULL,                                    '["CHARGING_END"]',                '{"charging":false,"battery":0.95}',              NULL, NULL, 10, 0.80),
('未知停靠(兜底)','UNKNOWN_IDLE',      NULL,                                    '["MOVE_END"]',                    '{"task_status":4}',                                5, NULL,  1, 0.30),
('休息站',        'REST_STATION',      NULL,                                    '["MOVE_END"]',                    '{"charging":false}',                              20, NULL,  9, 0.85);
