-- 注意：本文件仅作变更记录。实际迁移由 SuppliesSchemaMigrator/MaterialSchemaMigrator 启动时自动执行（幂等）。
-- 手动执行前请确认列不存在，否则会报 Duplicate column。
-- 物资（supplies）独立成单：independent_order=1 的物品必须单独成单，不与其他物品混合领用
ALTER TABLE supply_item ADD COLUMN independent_order TINYINT NOT NULL DEFAULT 0 COMMENT '是否独立成单:1是,0否';
