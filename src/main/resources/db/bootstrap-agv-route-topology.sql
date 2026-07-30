-- 路线模型2：机械化路线拓扑生成
-- 算法：从原始轨迹数据中提取站点序列 → 频次统计 → 噪声过滤(阈值3) → 硬约束 → 单行道检测
-- 与路线模型1(算法动态发现)不同：模型2基于统计学+物理约束，输出确定化的道路网络图
CREATE TABLE IF NOT EXISTS agv_route_topology_station (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    zone_key        VARCHAR(20)  NOT NULL COMMENT 'zone1|zone2',
    station_code    VARCHAR(20)  NOT NULL COMMENT '站点编号 LM/AP/CP',
    x               DOUBLE       NOT NULL COMMENT '站点锚点X(中位数)',
    y               DOUBLE       NOT NULL COMMENT '站点锚点Y(中位数)',
    observations    INT          NOT NULL DEFAULT 0 COMMENT '原始轨迹中该站点被观测到的次数',
    generated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_zone_station (zone_key, station_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='路线模型2-站点坐标锚点';

CREATE TABLE IF NOT EXISTS agv_route_topology_edge (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    zone_key        VARCHAR(20)  NOT NULL COMMENT 'zone1|zone2',
    station_from    VARCHAR(20)  NOT NULL COMMENT '起点站点',
    station_to      VARCHAR(20)  NOT NULL COMMENT '终点站点',
    distance_m      DOUBLE       NOT NULL COMMENT '站点间距离(米)',
    angle_deg       DOUBLE       NOT NULL COMMENT '正向角度 atan2(dy,dx)',
    reverse_angle_deg DOUBLE     NOT NULL COMMENT '反向角度 (angle+180)%360',
    forward_count   INT          NOT NULL DEFAULT 0 COMMENT '正向经过次数',
    reverse_count   INT          NOT NULL DEFAULT 0 COMMENT '反向经过次数',
    total_count     INT          NOT NULL DEFAULT 0 COMMENT '双向总次数',
    is_one_way      TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否单行道',
    one_way_direction VARCHAR(10) NULL COMMENT 'forward|reverse|null',
    confidence      VARCHAR(10)  NOT NULL DEFAULT 'medium' COMMENT 'high(>=5)|medium(3-4)',
    robot_ips       TEXT         NULL COMMENT 'JSON数组：经过此路段的AGV IP列表',
    path_json       MEDIUMTEXT   NULL COMMENT '实际轨迹路径 [[x,y],...] 含转角节点',
    generated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_zone_edge (zone_key, station_from, station_to),
    INDEX idx_zone (zone_key),
    INDEX idx_confidence (confidence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='路线模型2-验证后的道路网络边';

-- 增量迁移：为已存在的表补加新列
ALTER TABLE agv_route_topology_edge ADD COLUMN robot_ips TEXT NULL COMMENT 'JSON数组：经过此路段的AGV IP列表' AFTER confidence;
ALTER TABLE agv_route_topology_edge ADD COLUMN path_json MEDIUMTEXT NULL COMMENT '实际轨迹路径 [[x,y],...] 含转角节点' AFTER robot_ips;

-- 生成历史记录表：每次生成保留快照，可追溯
CREATE TABLE IF NOT EXISTS agv_route_topology_snapshot (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    snapshot_key    VARCHAR(50)  NOT NULL COMMENT '快照标识(时间戳)',
    zone_key        VARCHAR(20)  NOT NULL COMMENT 'zone1|zone2',
    station_count   INT          NOT NULL DEFAULT 0,
    edge_count      INT          NOT NULL DEFAULT 0,
    raw_segments    INT          NOT NULL DEFAULT 0 COMMENT '原始分段总数',
    noise_removed   INT          NOT NULL DEFAULT 0 COMMENT '被噪声过滤的段数',
    constraint_removed INT       NOT NULL DEFAULT 0 COMMENT '被硬约束过滤的段数',
    trajectory_window_hours INT  NOT NULL DEFAULT 168 COMMENT '分析窗口(小时)',
    algorithm_version VARCHAR(20) NOT NULL DEFAULT '2.0',
    generated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_snapshot_zone (zone_key, generated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='路线模型2-生成快照记录';
