-- Turnstile 人机验证配置（若启动种子未执行，手动执行此 SQL）
INSERT IGNORE INTO sys_system_config_def (module, config_key, label_zh, description, value_type, options_json, default_value, is_sensitive, requires_restart, is_public, update_time)
VALUES
('turnstile', 'turnstile.enabled',  '启用 Turnstile 验证', '登录页人机验证开关。关闭后仅账号锁定保护生效',            'BOOLEAN', '["true","false"]', 'false', 0, 0, 1, NOW()),
('turnstile', 'turnstile.site-key', 'Turnstile Site Key',  'Cloudflare Turnstile 站点密钥（公开），用于前端 widget 渲染', 'STRING',  NULL,              '',      0, 0, 1, NOW()),
('turnstile', 'turnstile.secret-key', 'Turnstile Secret Key', 'Cloudflare Turnstile 密钥（私密），用于服务端验证',    'STRING',  NULL,              '',      1, 0, 0, NOW());
