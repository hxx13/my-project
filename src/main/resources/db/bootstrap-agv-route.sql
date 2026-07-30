-- AGV 作业路线：从历史数据中发现并持久化的固定路线
CREATE TABLE IF NOT EXISTS agv_route (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    robot_ip        VARCHAR(20)  NOT NULL,
    name            VARCHAR(64)  NOT NULL COMMENT '路线名称',
    route_type      VARCHAR(20)  NOT NULL COMMENT 'TRANSPORT|REVERSE|REST|NAVIGATING',
    path_json       TEXT         NOT NULL COMMENT '[[x,y],[x,y],...] 路线坐标点序列',
    color           VARCHAR(8)   NOT NULL DEFAULT '#3b82f6',
    from_station    VARCHAR(64)  NULL COMMENT '起点区域名',
    to_station      VARCHAR(64)  NULL COMMENT '终点区域名',
    frequency       INT          NOT NULL DEFAULT 1 COMMENT '出现次数',
    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_route_robot (robot_ip),
    INDEX idx_route_type (route_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV作业路线';
