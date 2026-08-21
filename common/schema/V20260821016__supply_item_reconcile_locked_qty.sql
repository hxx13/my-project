-- 记录：启动时 SuppliesSchemaMigrator 会对 QUANTIFIED 物资按 PENDING 未删除领用行重算 locked_qty。
-- 用于修复硬删回收站工单 / 历史释放遗漏导致的幽灵锁定（locked_qty>0 但无 PENDING）。
-- 实际执行见 SuppliesSchemaMigrator.reconcileSql（幂等，每次启动）。
UPDATE supply_item si SET locked_qty = COALESCE((
  SELECT SUM(l.qty) FROM supply_claim_line l
  JOIN supply_claim_order o ON l.order_id = o.id
  WHERE l.item_id = si.id AND o.status = 'PENDING' AND (o.deleted IS NULL OR o.deleted = 0)
), 0) WHERE si.stock_mode = 'QUANTIFIED' AND (si.deleted IS NULL OR si.deleted = 0);
