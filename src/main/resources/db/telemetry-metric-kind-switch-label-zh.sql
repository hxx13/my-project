-- 已部署库：将 SWITCH 类型中文名由「开关（读写值）」统一为「开关」
UPDATE telemetry_metric_kind
SET label_zh = '开关'
WHERE code = 'SWITCH'
  AND builtin = 1
  AND (label_zh = '开关' OR label_zh LIKE '%读写值%');
