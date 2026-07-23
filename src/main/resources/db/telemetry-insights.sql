-- 遥测历史可视化中心：rollup / chart_group / display_profile / view_snapshot
-- 目标库（默认 twin_system）启动或升级前执行本脚本

CREATE TABLE IF NOT EXISTS telemetry_value_rollup (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    bucket_start DATETIME(3) NOT NULL COMMENT '桶起点',
    bucket_sec INT NOT NULL COMMENT '桶宽度秒（300=5min, 3600=1h）',
    variable_name VARCHAR(512) NOT NULL COMMENT 'WinCC 变量名',
    min_value DOUBLE NULL,
    max_value DOUBLE NULL,
    avg_value DOUBLE NULL,
    sample_count INT NOT NULL DEFAULT 0,
    UNIQUE KEY uk_tvr_var_bucket (variable_name(255), bucket_start, bucket_sec),
    KEY idx_tvr_bucket (bucket_start),
    KEY idx_tvr_var (variable_name(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='遥测 L1 预聚合（Raw→Rollup）';

CREATE TABLE IF NOT EXISTS telemetry_chart_group (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL COMMENT '对比组名称',
    description VARCHAR(512) NULL,
    variable_names_json TEXT NOT NULL COMMENT '变量名 JSON 数组',
    variable_metadata_json TEXT NULL COMMENT '变量元数据 JSON 数组（variableName/displayLabel/floorCode/metricKindCode/bundleCode/roomCanonical）',
    layout_mode VARCHAR(32) NOT NULL DEFAULT 'small_multiples' COMMENT 'small_multiples|normalized_deviation',
    source VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'auto_suite|manual',
    sort_order INT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tcg_sort (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='遥测对比组（风机+房间等）';

CREATE TABLE IF NOT EXISTS telemetry_display_profile (
    code VARCHAR(32) PRIMARY KEY COMMENT 'STANDARD|PRESENTATION|自定义',
    label VARCHAR(64) NOT NULL,
    config_json TEXT NOT NULL COMMENT '降采样/平滑/Y轴等 JSON',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='遥测展示配置档';

CREATE TABLE IF NOT EXISTS telemetry_view_snapshot (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    captured_at DATETIME(3) NOT NULL COMMENT '快照时刻',
    profile_code VARCHAR(32) NOT NULL,
    time_range_json TEXT NOT NULL COMMENT '{"from":"...","to":"..."}',
    chart_group_id BIGINT NULL,
    payload_json MEDIUMTEXT NOT NULL COMMENT '矩阵/曲线聚合 JSON',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tvs_captured (captured_at),
    KEY idx_tvs_profile (profile_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='遥测视图快照（合规留痕）';

INSERT IGNORE INTO telemetry_display_profile (code, label, config_json) VALUES
('STANDARD', '标准监测', '{"downsample":"min_max_bucket","smoothing":"none","yAxisMode":"auto_padded","showAlarmBands":true,"maxPoints":240}'),
('PRESENTATION', '参观展示', '{"downsample":"lttb","smoothing":"ema","emaWindow":5,"yAxisMode":"fixed_compliance","showAlarmBands":true,"maxPoints":120}');

-- 旧库升级：CREATE TABLE IF NOT EXISTS 不会为已有表补列
SET @col_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'telemetry_chart_group'
      AND COLUMN_NAME = 'variable_metadata_json'
);
SET @ddl := IF(
    @col_exists = 0,
    'ALTER TABLE telemetry_chart_group ADD COLUMN variable_metadata_json TEXT NULL COMMENT ''变量元数据 JSON 数组（variableName/displayLabel/floorCode/metricKindCode/bundleCode/roomCanonical）'' AFTER variable_names_json',
    'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
