-- 温湿度等测点值归档（约 30 天；由定时任务清理）
CREATE TABLE IF NOT EXISTS telemetry_value_archive (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    sample_at DATETIME(3) NOT NULL COMMENT '采样时间',
    variable_name VARCHAR(512) NOT NULL COMMENT 'WinCC 变量名',
    numeric_value DOUBLE NULL COMMENT '解析后的数值',
    raw_value VARCHAR(512) NULL COMMENT '原始值字符串',
    metric_kind_code VARCHAR(64) NULL,
    room_canonical VARCHAR(256) NULL,
    bundle_code VARCHAR(128) NULL,
    schema_version TINYINT NOT NULL DEFAULT 1,
    ingest_batch_id VARCHAR(64) NULL,
    ext_json TEXT NULL COMMENT '扩展 JSON 文本（预留天气等）',
    KEY idx_tva_sample_at (sample_at),
    KEY idx_tva_var_sample (variable_name(255), sample_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='遥测值归档（WinCC 刷新写入）';
