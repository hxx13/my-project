-- 目标库见 application.properties 的 spring.datasource.url（如 twin_system）
-- 扫码进出「门禁规则 → 大华权限」全局开关；与大华发卡「按可进房间预填规则」无表结构依赖，可同批执行

CREATE TABLE IF NOT EXISTS twin_access_rule_scan_config (
    id INT NOT NULL PRIMARY KEY COMMENT '固定 1 行全局配置',
    enter_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码进入时执行门禁规则大华批量下发',
    exit_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码离开时执行门禁规则大华权限回收',
    updated_by VARCHAR(64) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码进出是否执行门禁规则（大华联动）全局开关';

INSERT IGNORE INTO twin_access_rule_scan_config (id, enter_dispatch_enabled, exit_dispatch_enabled, updated_by)
VALUES (1, 1, 1, 'system');
