-- 目标库 twin_system：载体与菜单项多对多分配（菜单项独立配置，载体勾选分配）
-- 启动应用时 ScanDelaySchemaMigrator 也会幂等执行；可单独用客户端跑本脚本

CREATE TABLE IF NOT EXISTS twin_scan_delay_carrier_option (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    carrier_id BIGINT NOT NULL COMMENT 'twin_scan_delay_carrier.id',
    option_id BIGINT NOT NULL COMMENT 'twin_scan_delay_option.id',
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sdco_carrier_option (carrier_id, option_id),
    KEY idx_sdco_carrier (carrier_id, sort_order),
    KEY idx_sdco_option (option_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='载体与延迟菜单项分配';

-- 从旧版 option.carrier_id 迁移（仅当 junction 表为空时手动执行一次亦可）
INSERT IGNORE INTO twin_scan_delay_carrier_option (carrier_id, option_id, sort_order)
SELECT carrier_id, id, sort_order FROM twin_scan_delay_option
WHERE carrier_id IS NOT NULL;
