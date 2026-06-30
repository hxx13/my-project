-- RPG 经验数据截断：删除 2025-06-01 00:00:00 之前的进出流水与经验流水
-- 目标库见 application.properties spring.datasource.url（默认 twin_system）
-- 应用启动时也会按 twin.rpg.exp.cutoff.* 自动执行；本脚本供运维手动执行

SET @cutoff := '2025-06-01 00:00:00';

DELETE FROM twin_exp_record WHERE create_time < @cutoff;
DELETE FROM aro_access_log WHERE create_time < @cutoff;

UPDATE aro_personnel SET total_exp = 0;

-- 手动执行后请在 debug-personnel 点击「重算 RPG 经验」，或重启应用（auto-recalc=true 时自动重算）
