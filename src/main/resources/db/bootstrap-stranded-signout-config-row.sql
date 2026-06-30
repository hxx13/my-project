-- 第二道滞留签退配置行（id=2）
INSERT INTO stranded_violation_config (id, enabled, auto_signout_enabled)
VALUES (2, 0, 1)
ON DUPLICATE KEY UPDATE id = id;
