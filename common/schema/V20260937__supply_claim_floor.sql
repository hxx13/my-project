-- 注意：本文件仅作变更记录。实际迁移由 SuppliesSchemaMigrator 启动时自动执行（幂等）。
--
-- 领用单（《实验动物科学部内部物品领用单》）表头要印「领用楼层」，系统里原本没有任何楼层/房间字段：
-- 出库处理时由管理员手填，不填就留白手写。2026-09-22 用户定。
ALTER TABLE supply_claim_order ADD COLUMN claim_floor VARCHAR(64) NULL COMMENT '领用楼层（领用单表头，出库时手填）';
