-- AGV 分析小时级预聚合表
-- 轨迹数据写入时增量更新，避免每次分析全量扫描 agv_trajectory
CREATE TABLE IF NOT EXISTS agv_analytics_hourly (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    robot_ip        VARCHAR(20)  NOT NULL,
    hour_bucket     DATETIME(3)  NOT NULL COMMENT '整点小时 (truncate to hour)',
    sample_count    INT          NOT NULL DEFAULT 0,
    moving_count    INT          NOT NULL DEFAULT 0,
    total_distance_m DOUBLE      NOT NULL DEFAULT 0,
    first_x         DOUBLE       NULL,
    first_y         DOUBLE       NULL,
    last_x          DOUBLE       NULL,
    last_y          DOUBLE       NULL,
    min_x           DOUBLE       NULL,
    max_x           DOUBLE       NULL,
    min_y           DOUBLE       NULL,
    max_y           DOUBLE       NULL,
    speed_bins_json TEXT         NULL COMMENT '[0,0,0,0,0,0,0] 7 bins: 0-0.1,0.1-0.3,0.3-0.5,0.5-0.8,0.8-1.2,1.2-1.8,1.8+',
    station_json    TEXT         NULL COMMENT '[{"station":"LM01","visits":3,"totalSec":120},...]',
    hop_json        TEXT         NULL COMMENT '[{"from":"LM01","to":"CP01","durationSec":45,"distance":12.3},...]',
    accel_json      TEXT         NULL COMMENT '[{"ts":"...","mps2":0.8,"type":"急加速"},...] top 50',
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_robot_hour (robot_ip, hour_bucket),
    INDEX idx_hour (hour_bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AGV分析小时预聚合';
