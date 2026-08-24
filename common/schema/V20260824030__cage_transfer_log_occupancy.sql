-- 笼位占用事件日志:把 cage_transfer_log 从「笼位→笼位 转移日志」升级为「占用周期事件日志」。
-- 占用周期 = 个人账号 + 笼位 + 起止时间;event_type = start/transfer/copy/exit。
-- 幂等由 CageShelfSchemaMigrator(启动迁移器)的 try/catch 保证,本文件为归档记录,按序手动执行一次。

ALTER TABLE cage_transfer_log
    ADD COLUMN event_type VARCHAR(20) NOT NULL DEFAULT 'transfer' AFTER id;

ALTER TABLE cage_transfer_log
    ADD COLUMN occupant_id BIGINT NULL AFTER event_type;

ALTER TABLE cage_transfer_log
    ADD COLUMN occupant_name VARCHAR(128) NULL AFTER occupant_id;

ALTER TABLE cage_transfer_log
    MODIFY COLUMN from_animal_cage_id BIGINT NULL;

ALTER TABLE cage_transfer_log
    MODIFY COLUMN to_animal_cage_id BIGINT NULL;

ALTER TABLE cage_transfer_log
    MODIFY COLUMN operator_id BIGINT NULL;

CREATE INDEX idx_occupant ON cage_transfer_log (occupant_id);
