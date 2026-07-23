-- 内置指标：开关（布尔读写）、设定值（模拟量读写）。须在 telemetry_metric_kind.kind_role 列存在后执行。
INSERT IGNORE INTO telemetry_metric_kind (code, label_zh, kind_role, sort_order, builtin, active) VALUES
    ('SWITCH', '开关', 'SWITCH', 40, 1, 1),
    ('SETPOINT', '设定值', 'SETPOINT', 41, 1, 1);
