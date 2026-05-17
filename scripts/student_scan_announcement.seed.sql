-- 扫码弹窗公告全局配置（模块 student_violation）
-- 目标库见 application.properties 的 spring.datasource.url

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.scan.announcement.enabled',
           '启用扫码弹窗公告', '关闭后扫码不再展示公告翻页层。',
           'BOOLEAN', NULL, 'true', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.scan.announcement.enabled'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.scan.announcement.show_every_scan',
           '扫码公告·每次扫码展示', '开启后每次扫码自动展开公告。',
           'BOOLEAN', NULL, 'true', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.scan.announcement.show_every_scan'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.scan.announcement.apply_role_codes',
           '扫码公告生效角色', 'JSON 如 ["STUDENT"]；仅当前网页登录扫码操作员 sys_user 角色在列表内时展示。',
           'STRING', NULL, '["STUDENT"]', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.scan.announcement.apply_role_codes'
);
