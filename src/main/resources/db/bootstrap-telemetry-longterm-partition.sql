-- 长期归档·自定义分区（与 WinCC 变量导入分区无关）。
CREATE TABLE IF NOT EXISTS telemetry_longterm_partition (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL COMMENT '分区名称（tab 标题）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT 'tab 顺序',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tlp_name (name),
    KEY idx_tlp_order (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='长期归档·自定义分区';
