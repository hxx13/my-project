-- 告警配置表增加 mode 列，支持"自动对比"/"手动选择"各自独立配置
ALTER TABLE cage_alert_config
    ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'auto' COMMENT '配置模式: auto=自动对比, manual=手动选择';

-- 复制现有配置到两种模式
INSERT INTO cage_alert_config (status_code, status_label, threshold_days, enabled, mode)
SELECT status_code, status_label, threshold_days, enabled, 'manual'
FROM cage_alert_config
WHERE mode = 'auto'
  AND NOT EXISTS (SELECT 1 FROM cage_alert_config c2 WHERE c2.status_code = cage_alert_config.status_code AND c2.mode = 'manual');
