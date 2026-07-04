import type { MaterialStockMovementRow } from "@/api/domains/material.api";

/** 从当前库存锚点倒推各笔流水 stock_after（修正出库 fulfill 时快照写入错误） */
export function recomputeMovementStockAfter(
  movements: MaterialStockMovementRow[],
  currentStockByItemId: ReadonlyMap<number, number>,
): ReadonlyMap<number, number> {
  const result = new Map<number, number>();
  if (!movements.length || currentStockByItemId.size === 0) return result;

  const byItem = new Map<number, MaterialStockMovementRow[]>();
  for (const movement of movements) {
    if (!movement.id || movement.itemId == null) continue;
    const list = byItem.get(movement.itemId) ?? [];
    list.push(movement);
    byItem.set(movement.itemId, list);
  }

  for (const [itemId, list] of byItem) {
    const currentStock = currentStockByItemId.get(itemId);
    if (currentStock == null) continue;
    const sorted = [...list].sort((a, b) => {
      const cmp = (b.createdAt || "").localeCompare(a.createdAt || "");
      if (cmp !== 0) return cmp;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    let running = currentStock;
    for (const movement of sorted) {
      result.set(movement.id, running);
      running -= Number(movement.qty) || 0;
    }
  }

  return result;
}
