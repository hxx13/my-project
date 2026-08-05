-- 逐测点报警控制：死区、冷却、预设模板、缓冲可配置

ALTER TABLE telemetry_global_alarm_limits
    ADD COLUMN hysteresis_temp DECIMAL(10,3) NOT NULL DEFAULT 0.300 AFTER pressure_max,
    ADD COLUMN hysteresis_hum DECIMAL(10,3) NOT NULL DEFAULT 2.000 AFTER hysteresis_temp,
    ADD COLUMN hysteresis_pressure DECIMAL(10,3) NOT NULL DEFAULT 5.000 AFTER hysteresis_hum;

ALTER TABLE telemetry_suite_alarm_config
    ADD COLUMN hysteresis_temp DECIMAL(10,3) NULL AFTER pressure_max,
    ADD COLUMN hysteresis_hum DECIMAL(10,3) NULL AFTER hysteresis_temp,
    ADD COLUMN hysteresis_pressure DECIMAL(10,3) NULL AFTER hysteresis_hum;

ALTER TABLE telemetry_floor_alarm_config
    ADD COLUMN buffer_flush_minutes INT NOT NULL DEFAULT 5 AFTER notify_on_recovery;

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN alarm_cooldown_minutes INT NOT NULL DEFAULT 0 AFTER alarm_enabled;

CREATE TABLE IF NOT EXISTS telemetry_alarm_preset (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(64) NOT NULL,
    description VARCHAR(255) DEFAULT '',
    floor_code VARCHAR(32) NULL,
    temp_min DECIMAL(10,3) NULL,
    temp_max DECIMAL(10,3) NULL,
    hum_min DECIMAL(10,3) NULL,
    hum_max DECIMAL(10,3) NULL,
    pressure_min DECIMAL(10,3) NULL,
    pressure_max DECIMAL(10,3) NULL,
    hysteresis_temp DECIMAL(10,3) NULL,
    hysteresis_hum DECIMAL(10,3) NULL,
    hysteresis_pressure DECIMAL(10,3) NULL,
    alarm_cooldown_minutes INT NOT NULL DEFAULT 0,
    is_global TINYINT(1) NOT NULL DEFAULT 1,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_floor_code (floor_code),
    INDEX idx_is_global (is_global)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO telemetry_alarm_preset (name, description, temp_min, temp_max, hum_min, hum_max, hysteresis_temp, hysteresis_hum, hysteresis_pressure, alarm_cooldown_minutes, is_global)
VALUES ('标准鼠房', '通用鼠房温湿度阈值', 20.0, 26.0, 40.0, 70.0, 0.3, 2.0, 5.0, 10, 1);
INSERT INTO telemetry_alarm_preset (name, description, temp_min, temp_max, hum_min, hum_max, hysteresis_temp, hysteresis_hum, hysteresis_pressure, alarm_cooldown_minutes, is_global)
VALUES ('严格鼠房', '高要求实验鼠房', 22.0, 24.0, 50.0, 60.0, 0.2, 1.0, 3.0, 5, 1);
INSERT INTO telemetry_alarm_preset (name, description, temp_min, temp_max, hum_min, hum_max, hysteresis_temp, hysteresis_hum, hysteresis_pressure, alarm_cooldown_minutes, is_global)
VALUES ('大鼠房', '大鼠专用房，范围较宽', 18.0, 26.0, 30.0, 70.0, 0.5, 3.0, 5.0, 15, 1);
