-- AGV 机器人轨迹采集表
-- 每秒采集四台小车状态（位置/电量/告警等），支持历史轨迹回放
CREATE TABLE IF NOT EXISTS agv_trajectory (
    id            BIGINT       AUTO_INCREMENT PRIMARY KEY,
    robot_ip      VARCHAR(20)  NOT NULL COMMENT '机器人IP（172.22.159.16/18/20/22）',
    x             DOUBLE       NULL COMMENT 'AGV坐标系 X（米）',
    y             DOUBLE       NULL COMMENT 'AGV坐标系 Y（米）',
    angle         DOUBLE       NULL COMMENT '朝向（弧度）',
    battery       DOUBLE       NULL COMMENT '电量 0~1',
    task_status   INT          NULL COMMENT '任务状态码',
    map_name      VARCHAR(32)  NULL COMMENT '地图名（jiaoda-1/2LWQ/2LJQ）',
    station       VARCHAR(32)  NULL COMMENT '当前站点编号',
    charging      TINYINT(1)   NULL COMMENT '是否充电',
    blocked       TINYINT(1)   NULL COMMENT '是否阻挡',
    emergency     TINYINT(1)   NULL COMMENT '是否急停',
    confidence    DOUBLE       NULL COMMENT '定位置信度 0~1',
    odo           DOUBLE       NULL COMMENT '累计里程（米）',
    vehicle_id    VARCHAR(32)  NULL COMMENT '车辆编号（非唯一标识）',
    errors_json   TEXT         NULL COMMENT '错误列表 JSON',
    fatals_json   TEXT         NULL COMMENT '致命错误列表 JSON',
    warnings_json TEXT         NULL COMMENT '警告列表 JSON',
    created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '服务端入库时间',
    recorded_at   DATETIME(3)  NOT NULL COMMENT 'AGV数据产生时间（create_on字段，已转UTC）',
    INDEX idx_robot_time (robot_ip, recorded_at),
    INDEX idx_recorded_at (recorded_at),
    INDEX idx_station_time (station, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV机器人轨迹数据';
