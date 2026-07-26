-- ============================================================
-- V20260726004 — 动物房环境遥测报警配置表
-- 与 src/main/resources/db/bootstrap-telemetry-alarm-config.sql 同源
-- ============================================================
CREATE TABLE IF NOT EXISTS telemetry_floor_alarm_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    floor_code VARCHAR(32) NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    cooldown_minutes INT NOT NULL DEFAULT 30,
    notify_on_recovery TINYINT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_floor (floor_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS telemetry_suite_alarm_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    floor_code VARCHAR(32) NOT NULL,
    suite_norm VARCHAR(128) NOT NULL,
    enabled TINYINT DEFAULT NULL,
    temp_min VARCHAR(32) DEFAULT NULL,
    temp_max VARCHAR(32) DEFAULT NULL,
    hum_min VARCHAR(32) DEFAULT NULL,
    hum_max VARCHAR(32) DEFAULT NULL,
    pressure_min VARCHAR(32) DEFAULT NULL,
    pressure_max VARCHAR(32) DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_suite (suite_norm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS telemetry_alarm_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    variable_name VARCHAR(255) NOT NULL,
    floor_code VARCHAR(32),
    room_canonical VARCHAR(128),
    suite_norm VARCHAR(128),
    metric_kind VARCHAR(16),
    alarm_band VARCHAR(8),
    current_value VARCHAR(32),
    limit_value VARCHAR(32),
    sent_at DATETIME NOT NULL,
    INDEX idx_var_band (variable_name, alarm_band, sent_at),
    INDEX idx_floor_time (floor_code, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
