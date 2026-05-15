-- 指标字典语义角色（管理端下拉 / 后端过滤 LIMIT 行不参与动物房排卡）
ALTER TABLE telemetry_metric_kind
    ADD COLUMN kind_role VARCHAR(16) NOT NULL DEFAULT 'METRIC'
        COMMENT 'METRIC | LIMIT_MIN | LIMIT_MAX | SWITCH | SETPOINT'
        AFTER label_zh;

UPDATE telemetry_metric_kind SET kind_role = 'METRIC' WHERE kind_role IS NULL OR TRIM(kind_role) = '';
