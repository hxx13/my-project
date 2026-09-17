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
    ADD COLUMN alarm_enabled INT NULL COMMENT '逐变量报警开关: null=继承 0=禁用 1=启用',
    ADD COLUMN alarm_cooldown_minutes INT NOT NULL DEFAULT 0 COMMENT '逐变量重报警冷却(分钟)';

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

-- 清掉双重编码的乱码预设行：那些 name 的首字符落在 Latin-1 补充区（U+00C0–U+00FF），
-- 是历史上某次种子写入时 UTF-8 字节被按 Latin-1 解码所致。规范的中文预设名不可能以这些字符开头，
-- 所以这个判据不会误删正常预设。首次执行后该语句命中 0 行，长期留着也无害。
DELETE FROM telemetry_alarm_preset WHERE HEX(LEFT(name, 1)) LIKE 'C3%';

-- 存量清理：同一个 name 只保留 id 最小的一行。语句本身幂等，重复执行是空操作。
DELETE p1 FROM telemetry_alarm_preset p1
  JOIN telemetry_alarm_preset p2 ON p1.name = p2.name AND p1.id > p2.id;

-- 种子改为幂等：name 已存在就跳过，不再重复插入。
INSERT INTO telemetry_alarm_preset (name, description, temp_min, temp_max, hum_min, hum_max, hysteresis_temp, hysteresis_hum, hysteresis_pressure, alarm_cooldown_minutes, is_global)
SELECT '标准鼠房', '通用鼠房温湿度阈值', 20.0, 26.0, 40.0, 70.0, 0.3, 2.0, 5.0, 10, 1
WHERE NOT EXISTS (SELECT 1 FROM telemetry_alarm_preset WHERE name = '标准鼠房');

INSERT INTO telemetry_alarm_preset (name, description, temp_min, temp_max, hum_min, hum_max, hysteresis_temp, hysteresis_hum, hysteresis_pressure, alarm_cooldown_minutes, is_global)
SELECT '严格鼠房', '高要求实验鼠房', 22.0, 24.0, 50.0, 60.0, 0.2, 1.0, 3.0, 5, 1
WHERE NOT EXISTS (SELECT 1 FROM telemetry_alarm_preset WHERE name = '严格鼠房');

INSERT INTO telemetry_alarm_preset (name, description, temp_min, temp_max, hum_min, hum_max, hysteresis_temp, hysteresis_hum, hysteresis_pressure, alarm_cooldown_minutes, is_global)
SELECT '大鼠房', '大鼠专用房，范围较宽', 18.0, 26.0, 30.0, 70.0, 0.5, 3.0, 5.0, 15, 1
WHERE NOT EXISTS (SELECT 1 FROM telemetry_alarm_preset WHERE name = '大鼠房');
