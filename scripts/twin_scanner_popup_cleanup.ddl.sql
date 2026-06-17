-- 废弃 twin_scanner_popup 配置模块（进出提示已内置，延迟开关已迁至 twin_dahua_issue）
-- 目标库：application.properties 中 spring.datasource.url（默认 twin_system）
-- 应用启动时也会自动执行等价清理；本脚本供运维手动执行。

DELETE FROM sys_system_config WHERE module = 'twin_scanner_popup';
DELETE FROM sys_system_config_def WHERE module = 'twin_scanner_popup';
