-- 动物房温湿度/压强：全局报警上下限（单例行 id=1）
CREATE TABLE IF NOT EXISTS telemetry_global_alarm_limits (
    id TINYINT NOT NULL PRIMARY KEY COMMENT '固定为 1',
    temp_min VARCHAR(64) NULL COMMENT '温度下限',
    temp_max VARCHAR(64) NULL COMMENT '温度上限',
    hum_min VARCHAR(64) NULL COMMENT '湿度下限',
    hum_max VARCHAR(64) NULL COMMENT '湿度上限',
    pressure_min VARCHAR(64) NULL COMMENT '压强下限',
    pressure_max VARCHAR(64) NULL COMMENT '压强上限',
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物房全局报警限';

INSERT IGNORE INTO telemetry_global_alarm_limits (id) VALUES (1);
