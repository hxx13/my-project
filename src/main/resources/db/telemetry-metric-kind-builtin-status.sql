-- 内置指标：状态（测量值 METRIC；WinCC 多为 1/0，前端展示为 开/关；不可远程写入，区别于 SWITCH）
-- 须在 telemetry_metric_kind.kind_role 列存在且已执行 switch/setpoint 内置种子之后执行（INSERT IGNORE 可重复执行）。
INSERT IGNORE INTO telemetry_metric_kind (code, label_zh, kind_role, sort_order, builtin, active) VALUES
    ('STATUS', '状态', 'METRIC', 38, 1, 1);
