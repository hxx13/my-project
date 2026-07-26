-- ============================================================
-- 动物房环境遥测报警配置
-- ============================================================

-- 1. 楼层报警开关（floor_code 来自 telemetry_watchlist_tag 的 DISTINCT floor_code）
CREATE TABLE IF NOT EXISTS telemetry_floor_alarm_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    floor_code VARCHAR(32) NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '楼层报警总开关',
    cooldown_minutes INT NOT NULL DEFAULT 30 COMMENT '同一测点同一方向报警的最小间隔（分钟）',
    notify_on_recovery TINYINT NOT NULL DEFAULT 0 COMMENT '恢复正常时是否发通知',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_floor (floor_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 套间报警开关 + 阈值覆盖（suite_norm 由 room_canonical 分组算法得出）
CREATE TABLE IF NOT EXISTS telemetry_suite_alarm_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    floor_code VARCHAR(32) NOT NULL,
    suite_norm VARCHAR(128) NOT NULL COMMENT '套间标识（如 201A，由 standardSuiteRoomSegment/basementSuiteRoomSegment 得出）',
    enabled TINYINT DEFAULT NULL COMMENT 'NULL=继承楼层开关',
    temp_min VARCHAR(32) DEFAULT NULL COMMENT 'NULL=继承全局 telemetry_global_alarm_limits',
    temp_max VARCHAR(32) DEFAULT NULL,
    hum_min VARCHAR(32) DEFAULT NULL,
    hum_max VARCHAR(32) DEFAULT NULL,
    pressure_min VARCHAR(32) DEFAULT NULL,
    pressure_max VARCHAR(32) DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_suite (suite_norm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. 报警发送日志（冷却窗口去重）
CREATE TABLE IF NOT EXISTS telemetry_alarm_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    variable_name VARCHAR(255) NOT NULL COMMENT 'WinCC 变量名',
    floor_code VARCHAR(32),
    room_canonical VARCHAR(128),
    suite_norm VARCHAR(128),
    metric_kind VARCHAR(16) COMMENT 'TEMP | HUM | PRESSURE',
    alarm_band VARCHAR(8) COMMENT 'HIGH | LOW',
    current_value VARCHAR(32) COMMENT '报警时的读数',
    limit_value VARCHAR(32) COMMENT '当时生效的阈值',
    sent_at DATETIME NOT NULL,
    INDEX idx_var_band (variable_name, alarm_band, sent_at),
    INDEX idx_floor_time (floor_code, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. telemetry_watchlist_tag 增加 alarm_enabled（逐变量报警开关）
-- 注意：此 ALTER 不在主查询列中，仅当列存在时额外读取；不存在时默认 NULL(=继承 enabled)
-- 手工执行此 ALTER 后启用逐变量开关功能
