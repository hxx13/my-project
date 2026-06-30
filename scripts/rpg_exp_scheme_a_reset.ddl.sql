-- 方案 A 一次性清库（全量重算前执行，可选；/api/v1/twin/rpg/recalculate-all 也会自动 deleteAll）
-- 目标库见 application.properties spring.datasource.url（默认 twin_system）

DELETE FROM twin_exp_record;
UPDATE aro_personnel SET total_exp = 0;
