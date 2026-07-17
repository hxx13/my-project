-- 注意：本文件仅作变更记录。实际迁移由 SuppliesSchemaMigrator 启动时自动执行（幂等）。
ALTER TABLE supply_item ADD COLUMN locked_qty INT NOT NULL DEFAULT 0;
-- 回填：现存未删除 PENDING 领用单的行数量计入锁定
UPDATE supply_item si SET locked_qty = COALESCE((
  SELECT SUM(l.qty) FROM supply_claim_line l
  JOIN supply_claim_order o ON l.order_id = o.id
  WHERE l.item_id = si.id AND o.status = 'PENDING' AND (o.deleted IS NULL OR o.deleted = 0)
), 0) WHERE si.stock_mode = 'QUANTIFIED';
