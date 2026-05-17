-- 未绑卡扫码提示（模块 student_violation，在学生违规管理页配置）
-- 目标库见 application.properties 的 spring.datasource.url（如 twin_system）

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.violation.unbound.notice.enabled',
           '启用未绑卡扫码提示', '关闭后扫描未绑卡人员不再弹出警示框。',
           'BOOLEAN', NULL, 'true', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.violation.unbound.notice.enabled'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.violation.unbound.notice.show_every_scan',
           '未绑卡提示·每次扫码展示', '开启后每次扫描未绑卡人员都会自动展开居中提示。',
           'BOOLEAN', NULL, 'true', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.violation.unbound.notice.show_every_scan'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.violation.unbound.notice.forbid_enter',
           '未绑卡禁止扫码进入', '开启后未绑卡人员无法扫码进入（离开不受影响）。',
           'BOOLEAN', NULL, 'false', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.violation.unbound.notice.forbid_enter'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.violation.unbound.notice.apply_role_codes',
           '未绑卡提示生效角色', 'JSON 如 ["STUDENT"]；仅当前网页登录扫码操作员 sys_user 角色在列表内时生效。',
           'STRING', NULL, '["STUDENT"]', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.violation.unbound.notice.apply_role_codes'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.violation.unbound.notice.text',
           '未绑卡提示文案', '扫描未绑卡人员时居中警示框显示的文字，支持多行。',
           'STRING', NULL, '您尚未绑定校园卡，请先完成绑卡后再使用扫码进出功能。', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.violation.unbound.notice.text'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'student_violation', 'student.violation.unbound.notice.image_urls',
           '未绑卡提示附图', 'JSON 数组字符串，如 [] 或 ["https://..."]。',
           'STRING', NULL, '[]', 0, 0, 0, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'student_violation' AND d.config_key = 'student.violation.unbound.notice.image_urls'
);
