-- ============================================================
-- 变量长期归档：选中变量 / 采样值 / 采样轮次留痕
-- ============================================================

CREATE TABLE IF NOT EXISTS telemetry_longterm_variable (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    wincc_variable_name VARCHAR(512) NOT NULL COMMENT 'WinCC 变量名',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '顺序：宽表列序与导出列序',
    display_label VARCHAR(512) NULL COMMENT '导出表头用，默认取变量目录展示名',
    unit VARCHAR(32) NULL COMMENT '单位，取不到留空不猜',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '单变量级临时停采',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tlv_variable (wincc_variable_name(190)),
    KEY idx_tlv_order (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='长期归档·选中变量';

CREATE TABLE IF NOT EXISTS telemetry_longterm_sample (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sample_at DATETIME(3) NOT NULL COMMENT '本轮到点时间',
    variable_name VARCHAR(512) NOT NULL,
    numeric_value DOUBLE NULL,
    raw_value VARCHAR(512) NULL,
    metric_kind_code VARCHAR(64) NULL,
    room_canonical VARCHAR(256) NULL,
    floor_code VARCHAR(32) NULL,
    bundle_code VARCHAR(128) NULL,
    snapshot_at DATETIME(3) NULL COMMENT '这一行取自哪一刻的采集数据',
    tick_batch_id VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tls_sample_at (sample_at),
    KEY idx_tls_var_sample (variable_name(190), sample_at),
    UNIQUE KEY uk_tls_tick_var (tick_batch_id, variable_name(190))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='长期归档·采样值';

CREATE TABLE IF NOT EXISTS telemetry_longterm_sample_log (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_at DATETIME(3) NOT NULL,
    outcome VARCHAR(16) NOT NULL COMMENT 'OK|SKIPPED|FAILED',
    rows_written INT NOT NULL DEFAULT 0,
    reason VARCHAR(512) NULL,
    duration_ms BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tlsl_run_at (run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='长期归档·采样轮次留痕';
