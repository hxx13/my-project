-- 可选：一次性物理删除 2025-06-01 之前的进出/经验流水（默认不在应用启动时执行）
-- 目标库见 application.properties spring.datasource.url
-- 经验计算已在后端内置截止日 2025-06-01，不执行本脚本也不影响 RPG 重算口径

SET @cutoff := '2025-06-01 00:00:00';

DELETE FROM twin_exp_record WHERE create_time < @cutoff;
DELETE FROM aro_access_log WHERE create_time < @cutoff;

UPDATE aro_personnel SET total_exp = 0;

-- 执行后请在 debug-personnel 点击「重算 RPG 经验」
