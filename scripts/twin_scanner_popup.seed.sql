-- 扫码弹窗进出成功提示（模块 twin_scanner_popup）
-- 目标库见 application.properties 的 spring.datasource.url（如 twin_system）

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'twin_scanner_popup', 'scanner.access.notice.enabled',
           '启用进出成功提示', '关闭后进入/离开成功不再显示居中提示。',
           'BOOLEAN', NULL, 'true', 0, 0, 1, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'twin_scanner_popup' AND d.config_key = 'scanner.access.notice.enabled'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'twin_scanner_popup', 'scanner.access.notice.duration_ms',
           '提示自动关闭（毫秒）', '居中提示显示时长。',
           'NUMBER', NULL, '3000', 0, 0, 1, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'twin_scanner_popup' AND d.config_key = 'scanner.access.notice.duration_ms'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'twin_scanner_popup', 'scanner.access.enter.own_text',
           '进入成功·自带校园卡', '自带校园卡进入成功提示，支持多行。',
           'STRING', NULL, '您已进入', 0, 0, 1, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'twin_scanner_popup' AND d.config_key = 'scanner.access.enter.own_text'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'twin_scanner_popup', 'scanner.access.enter.borrowed_text',
           '进入成功·领用公卡', '领用公卡进入成功提示，支持多行。',
           'STRING', NULL, '您已进入', 0, 0, 1, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'twin_scanner_popup' AND d.config_key = 'scanner.access.enter.borrowed_text'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'twin_scanner_popup', 'scanner.access.exit.own_text',
           '离开成功·自带校园卡', '离开动画结束并切回按钮后的提示，支持多行。',
           'STRING', NULL, '您已离开', 0, 0, 1, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'twin_scanner_popup' AND d.config_key = 'scanner.access.exit.own_text'
);

INSERT INTO sys_system_config_def
(module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
SELECT * FROM (
    SELECT 'twin_scanner_popup', 'scanner.access.exit.borrowed_text',
           '离开成功·领用公卡', '离开动画结束并切回按钮后的提示，支持多行。',
           'STRING', NULL, '您已离开', 0, 0, 1, NOW()
) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def d
    WHERE d.module = 'twin_scanner_popup' AND d.config_key = 'scanner.access.exit.borrowed_text'
);

-- 若定义已存在但 is_public=0，执行一次以让前端 /api/public/runtime-config 可读：
-- UPDATE sys_system_config_def SET is_public = 1 WHERE module = 'twin_scanner_popup';
