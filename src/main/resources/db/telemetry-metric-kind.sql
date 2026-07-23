-- WinCC 动物房指标类型字典（管理端可维护）。与 telemetry_watchlist_tag.metric_kind_code 对应。
CREATE TABLE IF NOT EXISTS telemetry_metric_kind (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL COMMENT '英文码，如 TEMP',
    label_zh    VARCHAR(128) NOT NULL COMMENT '中文名，如 温度',
    sort_order  INT          NOT NULL DEFAULT 0,
    builtin     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=内置种子，删除接口可拒绝',
    active      TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0=下拉隐藏',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_telemetry_metric_kind_code (code),
    KEY idx_telemetry_metric_kind_sort (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='WinCC 变量指标类型';

INSERT IGNORE INTO telemetry_metric_kind (code, label_zh, sort_order, builtin, active) VALUES
    ('TEMP', '温度', 10, 1, 1),
    ('HUM', '湿度', 20, 1, 1),
    ('PRESSURE', '压差', 30, 1, 1);
