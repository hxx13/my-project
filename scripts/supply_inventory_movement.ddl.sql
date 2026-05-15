-- 物资库存流水（入/出库及库存调整），与 supply_item 关联。
-- 目标库执行一次即可（与 SuppliesSchemaMigrator 中 CREATE IF NOT EXISTS 一致）。

CREATE TABLE IF NOT EXISTS supply_inventory_movement (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    item_id BIGINT NOT NULL COMMENT '物资ID',
    movement_type VARCHAR(32) NOT NULL COMMENT 'INBOUND|OUTBOUND|ADJUST',
    qty INT NOT NULL COMMENT '变动数量：入库/出库为正的数量；调整为 new-old',
    stock_after INT NULL COMMENT '变动后库存快照',
    claim_id VARCHAR(64) NULL COMMENT '关联领用单',
    claim_line_id BIGINT NULL COMMENT '关联领用明细行',
    operator_user_id VARCHAR(64) NULL COMMENT '处理人',
    applicant_user_id VARCHAR(64) NULL COMMENT '申请领用人（出库时）',
    remark VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sim_item_time (item_id, created_at),
    KEY idx_sim_claim (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资库存出入库流水';
